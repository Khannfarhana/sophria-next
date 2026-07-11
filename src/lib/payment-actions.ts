"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "next-auth";
import { getStripe } from "@/lib/stripe";
import { markBookingPaid } from "@/lib/payments";

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
): Promise<{ url: string }> {
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
    .select("id, reference, customer_id, status, payment_status, fare_estimate, pickup_location, dropoff_location")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (booking.status !== "confirmed" || booking.payment_status !== "pending") {
    throw new Error("This booking is not awaiting payment.");
  }

  const amountCents = Math.round(Number(booking.fare_estimate) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    throw new Error("This booking's fare cannot be charged online — please contact dispatch.");
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
            unit_amount: amountCents,
            product_data: {
              name: `SophRia chauffeur booking ${booking.reference}`,
              description: `${booking.pickup_location} → ${booking.dropoff_location}`,
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
                  product_data: {
                    name: "Driver tip",
                    description: "100% goes to your chauffeur",
                  },
                },
              },
            ]
          : []),
      ],
      // tip_cents rides in server-created metadata — markBookingPaid reads it
      // back from Stripe, never from the client.
      metadata: { booking_id: booking.id, tip_cents: String(tipCents) },
      payment_intent_data: { metadata: { booking_id: booking.id, tip_cents: String(tipCents) } },
      success_url: `${appUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard?payment=cancelled`,
    },
    // Repeat clicks (double-click, two tabs) get the SAME session back instead
    // of minting parallel payable sessions; a fare edit or a different tip
    // changes the key and therefore mints a fresh session at the new total.
    { idempotencyKey: `checkout:${booking.id}:${amountCents}:${tipCents}` },
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
export async function verifyCheckoutSessionAction(sessionId: string): Promise<{ paid: boolean }> {
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

  if (checkout.payment_status !== "paid") return { paid: false };
  await markBookingPaid({
    bookingId,
    paymentIntentId:
      typeof checkout.payment_intent === "string"
        ? checkout.payment_intent
        : checkout.payment_intent?.id ?? checkout.id,
    amountCents: checkout.amount_total ?? 0,
    currency: checkout.currency ?? "cad",
    tipCents: Math.max(0, Number(checkout.metadata?.tip_cents ?? 0) || 0),
  });
  return { paid: true };
}
