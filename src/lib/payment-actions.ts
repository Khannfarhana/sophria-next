"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "next-auth";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { markBookingPaid, markBookingAuthorized, canHoldUntil } from "@/lib/payments";
import { pickupInstant } from "@/lib/datetime";

/**
 * Stripe Checkout server actions. Payment is collected AFTER the admin
 * confirms a booking and BEFORE a driver can be assigned:
 * pending → confirmed (+ pay email/popup) → paid → driver_assigned → …
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
): Promise<{ url: string; hold: boolean }> {
  const session = await requireSession();
  const admin = getServiceClient();

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

/**
 * Turn a completed Checkout session into the right booking state. Shared by the
 * webhook and the success-redirect, either of which may land first.
 *
 * The subtlety: for a manual-capture session Stripe leaves
 * `session.payment_status` as "unpaid" until you capture, because nothing has
 * been charged. Gating on `payment_status === "paid"` — as this did — silently
 * ignores every held booking. The PaymentIntent's status is the truth:
 * `requires_capture` means the funds are held.
 */
export async function settleCheckoutSession(
  checkout: Stripe.Checkout.Session,
): Promise<{ paid: boolean; held?: boolean }> {
  const bookingId = checkout.metadata?.booking_id;
  if (!bookingId) return { paid: false };

  const paymentIntentId =
    typeof checkout.payment_intent === "string" ? checkout.payment_intent : checkout.payment_intent?.id ?? null;
  const tipCents = Math.max(0, Number(checkout.metadata?.tip_cents ?? 0) || 0);

  if (paymentIntentId) {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "requires_capture") {
      await markBookingAuthorized({ bookingId, paymentIntentId, tipCents });
      return { paid: true, held: true };
    }
  }

  // Immediate-capture path (booking beyond the hold window, or a legacy session).
  if (checkout.payment_status !== "paid") return { paid: false };
  await markBookingPaid({
    bookingId,
    paymentIntentId: paymentIntentId ?? checkout.id,
    amountCents: checkout.amount_total ?? 0,
    currency: checkout.currency ?? "cad",
    tipCents,
  });
  return { paid: true, held: false };
}
