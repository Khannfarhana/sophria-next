"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "next-auth";
import { getStripe } from "@/lib/stripe";
import { canHoldUntil, settleCheckoutSession } from "@/lib/payments";
import { pickupInstant } from "@/lib/datetime";
import { depositSplit } from "@/lib/pricing";
import { loadPricingConfig } from "@/lib/pricing-config.server";

/**
 * Stripe Checkout server actions. Payment is collected AFTER the admin
 * confirms a booking and BEFORE a driver can be assigned:
 * pending → confirmed (+ pay email/popup) → paid → driver_assigned → …
 *
 * Two ways to secure a booking (both count as payment_status 'paid'/'authorized'
 * for the dispatch wall):
 *   full    — the whole fare (held ≤6 days out, charged beyond the window)
 *   deposit — SophRia's share only (commission + airport fee + HST), charged
 *             immediately; the chauffeur's share is settled later in cash or
 *             via createBalanceCheckoutSessionAction.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

/**
 * Create (or re-use, via the idempotency key) a hosted Checkout session for
 * the full fare of the caller's own confirmed-but-unpaid booking — plus an
 * optional driver tip — and return its URL for a client-side redirect.
 * Created on demand — hosted sessions expire after 24h, so emails link to
 * /dashboard, never to a session URL.
 */
export async function createCheckoutSessionAction(
  bookingId: string,
  tipDollars?: number,
  paymentMode: "full" | "deposit" = "full",
): Promise<{ url: string; hold: boolean }> {
  const session = await requireSession();
  const admin = getServiceClient();

  if (paymentMode !== "full" && paymentMode !== "deposit") {
    throw new Error("Unknown payment mode.");
  }

  // Tip safety: server-side clamp — never negative (a negative "tip" would
  // discount the fare), whole cents, sane upper bound.
  const tipCents = Math.round(Number(tipDollars ?? 0) * 100);
  if (!Number.isFinite(tipCents) || tipCents < 0) {
    throw new Error("Tip must be a positive amount.");
  }
  if (tipCents > 100000) {
    throw new Error("Tip is too large — please contact dispatch.");
  }

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, reference, customer_id, status, payment_status, fare_estimate, airport_fee, tax_amount, pickup_datetime, pickup_location, dropoff_location",
    )
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (booking.status !== "confirmed" || booking.payment_status !== "pending") {
    throw new Error("This booking is not awaiting payment.");
  }

  if (paymentMode === "deposit") {
    return createDepositSession(session, booking);
  }

  // fare_estimate is the PRE-TAX subtotal (airport fee included); HST rides on
  // top. Both are itemised below so the Stripe receipt matches the quote the
  // customer accepted, rather than one opaque number.
  const airportFeeCents = Math.round(Number(booking.airport_fee ?? 0) * 100);
  const taxCents = Math.round(Number(booking.tax_amount ?? 0) * 100);
  const rideCents = Math.round(Number(booking.fare_estimate) * 100) - airportFeeCents;
  const amountCents = rideCents + airportFeeCents + taxCents;
  if (!Number.isFinite(amountCents) || amountCents < 50 || rideCents < 0) {
    throw new Error("This booking's fare cannot be charged online — please contact dispatch.");
  }

  // Hold the money rather than taking it, and capture when the ride completes —
  // but only when the pickup is close enough that the authorization will still
  // be alive. Beyond that window the hold would lapse before the ride and
  // capture would fail, so those bookings are charged up front (as they were
  // before) and told so at checkout. See AUTH_HOLD_WINDOW_DAYS.
  const hold = canHoldUntil(pickupInstant(booking.pickup_datetime).getTime());

  const appUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const checkout = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: rideCents,
            product_data: {
              name: `SophRia chauffeur booking ${booking.reference}`,
              description: `${booking.pickup_location} → ${booking.dropoff_location}`,
            },
          },
        },
        ...(airportFeeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "cad",
                  unit_amount: airportFeeCents,
                  product_data: {
                    name: "Airport fee",
                    description: "Levied by the airport authority on airport pickups and drop-offs",
                  },
                },
              },
            ]
          : []),
        ...(taxCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "cad",
                  unit_amount: taxCents,
                  product_data: { name: "HST (13%)", description: "Ontario Harmonized Sales Tax" },
                },
              },
            ]
          : []),
        ...(tipCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "cad",
                  unit_amount: tipCents,
                  product_data: {
                    name: "Driver tip",
                    description: "100% goes to your chauffeur",
                  },
                },
              },
            ]
          : []),
      ],
      // tip_cents rides in server-created metadata — the settle path reads it
      // back from Stripe, never from the client.
      metadata: { booking_id: booking.id, tip_cents: String(tipCents) },
      payment_intent_data: {
        // The whole point: authorize now, capture when the ride is done.
        ...(hold ? { capture_method: "manual" as const } : {}),
        description: `SophRia booking ${booking.reference}`,
        metadata: { booking_id: booking.id, tip_cents: String(tipCents) },
      },
      success_url: `${appUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard?payment=cancelled`,
    },
    // Repeat clicks (double-click, two tabs) get the SAME session back instead
    // of minting parallel payable sessions; a fare edit or a different tip
    // changes the key and therefore mints a fresh session at the new total.
    // `hold` is in the key too: a booking that crosses the window boundary
    // between attempts must not reuse a session created under the other mode.
    { idempotencyKey: `checkout:${booking.id}:${amountCents}:${tipCents}:${hold ? "hold" : "charge"}` },
  );
  if (!checkout.url) throw new Error("Stripe did not return a checkout URL");
  return { url: checkout.url, hold };
}

/**
 * The deposit leg of deposit-mode payment. NOT exported — reached only through
 * createCheckoutSessionAction's ownership/state gate above.
 *
 * Amounts are computed here from the STORED fare columns and the live config —
 * never from the client. Always an immediate charge (never a hold): the whole
 * point of a deposit is a small, non-expiring commitment, which also makes it
 * the natural choice for bookings beyond the 6-day hold window.
 */
async function createDepositSession(
  session: Session,
  booking: {
    id: string;
    reference: string;
    fare_estimate: number;
    airport_fee: number | null;
    tax_amount: number | null;
    pickup_location: string;
    dropoff_location: string;
  },
): Promise<{ url: string; hold: boolean }> {
  const cfg = await loadPricingConfig();
  const { deposit, balance } = depositSplit({
    fareEstimate: booking.fare_estimate,
    airportFee: booking.airport_fee,
    hst: booking.tax_amount,
    driverRate: cfg.defaultDriverPayoutRate,
  });
  const depositCents = Math.round(deposit * 100);
  const balanceCents = Math.round(balance * 100);
  if (depositCents < 50 || balanceCents <= 0) {
    // Degenerate splits (tiny fares, 100% driver share) can't be deposited.
    throw new Error("This booking can't be reserved with a deposit — please pay in full.");
  }

  const appUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const checkout = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: depositCents,
            product_data: {
              name: `Reservation deposit — booking ${booking.reference}`,
              description:
                `${booking.pickup_location} → ${booking.dropoff_location}. Covers SophRia's service share, ` +
                `airport fees and HST. The remaining $${balance.toFixed(2)} is payable to your chauffeur — in cash at the ride, or online any time.`,
            },
          },
        },
      ],
      // purpose routes the settle path; amounts ride in SERVER-created metadata
      // so the split written to the booking is the one Stripe actually charged.
      metadata: {
        booking_id: booking.id,
        purpose: "deposit",
        deposit_cents: String(depositCents),
        balance_cents: String(balanceCents),
      },
      payment_intent_data: {
        description: `SophRia booking ${booking.reference} — reservation deposit`,
        metadata: { booking_id: booking.id, purpose: "deposit" },
      },
      success_url: `${appUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard?payment=cancelled`,
    },
    { idempotencyKey: `deposit:${booking.id}:${depositCents}` },
  );
  if (!checkout.url) throw new Error("Stripe did not return a checkout URL");
  return { url: checkout.url, hold: false };
}

/**
 * Pay the outstanding chauffeur's share of a deposit booking online, plus an
 * optional tip. Available until the balance is settled (a cash collection at
 * the ride settles it too).
 */
export async function createBalanceCheckoutSessionAction(
  bookingId: string,
  tipDollars?: number,
): Promise<{ url: string }> {
  const session = await requireSession();
  const admin = getServiceClient();

  const tipCents = Math.round(Number(tipDollars ?? 0) * 100);
  if (!Number.isFinite(tipCents) || tipCents < 0) throw new Error("Tip must be a positive amount.");
  if (tipCents > 100000) throw new Error("Tip is too large — please contact dispatch.");

  const { data: booking } = await admin
    .from("bookings")
    .select("id, reference, customer_id, status, payment_status, payment_mode, balance_due, balance_paid_at, pickup_location, dropoff_location")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (booking.payment_mode !== "deposit" || booking.payment_status !== "paid") {
    throw new Error("This booking has no outstanding balance.");
  }
  if (booking.balance_paid_at) throw new Error("The balance for this ride is already settled.");
  if (["cancelled", "rejected"].includes(booking.status)) {
    throw new Error("This booking is no longer payable.");
  }

  const balanceCents = Math.round(Number(booking.balance_due ?? 0) * 100);
  if (balanceCents < 50) throw new Error("This booking's balance cannot be charged online — please contact dispatch.");

  const appUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const checkout = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: balanceCents,
            product_data: {
              name: `Remaining balance — booking ${booking.reference}`,
              description: `Your chauffeur's share for ${booking.pickup_location} → ${booking.dropoff_location}.`,
            },
          },
        },
        ...(tipCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "cad",
                  unit_amount: tipCents,
                  product_data: { name: "Driver tip", description: "100% goes to your chauffeur" },
                },
              },
            ]
          : []),
      ],
      metadata: { booking_id: booking.id, purpose: "balance", tip_cents: String(tipCents) },
      payment_intent_data: {
        description: `SophRia booking ${booking.reference} — balance`,
        metadata: { booking_id: booking.id, purpose: "balance", tip_cents: String(tipCents) },
      },
      success_url: `${appUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard?payment=cancelled`,
    },
    { idempotencyKey: `balance:${booking.id}:${balanceCents}:${tipCents}` },
  );
  if (!checkout.url) throw new Error("Stripe did not return a checkout URL");
  return { url: checkout.url };
}

/**
 * Called from the dashboard on the ?payment=success return. Applies the same
 * idempotent write as the webhook, so payment lands instantly in the UI and
 * the flow works even when no webhook is configured (local dev without
 * `stripe listen`). Whichever of the two runs first wins.
 */
export async function verifyCheckoutSessionAction(sessionId: string): Promise<{ paid: boolean; held?: boolean }> {
  const session = await requireSession();
  if (!/^cs_/.test(sessionId)) throw new Error("Invalid session id");

  const checkout = await getStripe().checkout.sessions.retrieve(sessionId);
  const bookingId = checkout.metadata?.booking_id;
  if (!bookingId) return { paid: false };

  const admin = getServiceClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("customer_id")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");

  return settleCheckoutSession(checkout);
}

