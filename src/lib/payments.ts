import "server-only";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/stripe";
import { notifyPaymentReceived } from "@/lib/mailer/notifications";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// The hold window lives in its own module so client components can share the
// rule — this file is server-only. Re-exported for existing importers.
import { AUTH_HOLD_WINDOW_DAYS } from "@/lib/payment-window";
export { AUTH_HOLD_WINDOW_DAYS, canHoldUntil } from "@/lib/payment-window";

/**
 * Best-effort: expire any OPEN Checkout sessions for a booking. Used when the
 * admin changes the fare — a session created at the old amount would otherwise
 * stay payable for up to 24h. Non-throwing (mock mode has no Stripe key).
 */
export async function expireOpenCheckoutSessions(bookingId: string) {
  try {
    const stripe = getStripe();
    const sessions = await stripe.checkout.sessions.list({ status: "open", limit: 100 });
    for (const s of sessions.data) {
      if (s.metadata?.booking_id === bookingId) {
        await stripe.checkout.sessions.expire(s.id);
      }
    }
  } catch (err) {
    console.error("[payments] expiring open checkout sessions failed:", err);
  }
}

/**
 * Refund part or all of a captured payment, and record it on the booking.
 *
 * Call ONLY after atomically claiming the cancellation (a conditional status
 * update that no concurrent caller can also win) — Stripe's idempotency key is
 * a second line of defence against a double refund, not the first.
 *
 * Returns the refund id, or null when there was nothing to refund. Throws if
 * Stripe rejects: the caller must know the money did not move.
 */
export async function refundBookingPayment(opts: {
  bookingId: string;
  paymentIntentId: string | null;
  amountCents: number;
  penalty: number;
}): Promise<string | null> {
  if (opts.amountCents <= 0) return null;
  // markBookingPaid stores the PaymentIntent id, but falls back to the Checkout
  // session id if Stripe ever omits it — only a pi_ can be refunded.
  if (!opts.paymentIntentId?.startsWith("pi_")) {
    console.error(
      `[payments] booking ${opts.bookingId} has no refundable payment intent (${opts.paymentIntentId}) — refund must be issued by hand`,
    );
    return null;
  }

  const refund = await getStripe().refunds.create(
    {
      payment_intent: opts.paymentIntentId,
      amount: opts.amountCents,
      reason: "requested_by_customer",
      metadata: { booking_id: opts.bookingId, penalty_cad: String(opts.penalty) },
    },
    { idempotencyKey: `refund:${opts.bookingId}` },
  );

  const admin = svc();
  const { error } = await admin
    .from("bookings")
    .update({
      // A partial refund still leaves the booking settled, but "refunded" is the
      // only terminal value the enum offers; the kept penalty is recorded in
      // cancellation_penalty rather than inferred from payment_status.
      payment_status: "refunded" as const,
      refund_amount: opts.amountCents / 100,
      stripe_refund_id: refund.id,
    })
    .eq("id", opts.bookingId);
  if (error) {
    // The money HAS moved — never surface this as a failed refund.
    console.error(`[payments] refund ${refund.id} succeeded but booking update failed:`, error.message);
  }
  return refund.id;
}

/**
 * Idempotent "funds are held" write, for the authorize-then-capture flow.
 *
 * Mirrors markBookingPaid's gate — a conditional update off payment_status
 * 'pending' — so the webhook and the success-redirect can race safely.
 *
 * No ledger row is written here: nothing has been charged yet. The payments row
 * is inserted at capture, when money actually moves.
 */
export async function markBookingAuthorized(opts: {
  bookingId: string;
  paymentIntentId: string;
  tipCents?: number;
}): Promise<{ already: boolean }> {
  const admin = svc();
  const tip = Math.max(0, Math.round(Number(opts.tipCents ?? 0))) / 100;
  const now = new Date();

  const { data, error } = await admin
    .from("bookings")
    .update({
      payment_status: "authorized" as const,
      stripe_payment_id: opts.paymentIntentId,
      tip,
      authorized_at: now.toISOString(),
      auth_expires_at: new Date(now.getTime() + AUTH_HOLD_WINDOW_DAYS * 86_400_000).toISOString(),
    })
    .eq("id", opts.bookingId)
    .eq("payment_status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { already: true };

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { already: false };
}

/**
 * Capture a held authorization, in full or in part.
 *
 * Called on ride completion (full) and on cancellation inside the penalty
 * window (partial — the fee is taken from the hold and the rest released by
 * Stripe automatically, so the customer never waits on a refund).
 *
 * Throws if the hold has lapsed or the capture is rejected: the caller must
 * know the money did not move. Returns null when there was nothing to capture.
 */
export async function captureBookingPayment(opts: {
  bookingId: string;
  paymentIntentId: string | null;
  /** Omit to capture the full authorized amount. */
  amountCents?: number;
  currency?: string;
}): Promise<string | null> {
  if (!opts.paymentIntentId?.startsWith("pi_")) {
    console.error(
      `[payments] booking ${opts.bookingId} has no capturable payment intent (${opts.paymentIntentId})`,
    );
    return null;
  }
  if (opts.amountCents != null && opts.amountCents <= 0) return null;

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(opts.paymentIntentId);

  // Already captured — treat as success rather than throwing. The webhook and
  // completeRideAction can both reach this.
  if (intent.status === "succeeded") {
    console.warn(`[payments] booking ${opts.bookingId} already captured`);
    return intent.id;
  }
  if (intent.status !== "requires_capture") {
    throw new Error(
      `This booking's authorization is no longer capturable (${intent.status}). It may have expired — take payment manually.`,
    );
  }

  const captured = await stripe.paymentIntents.capture(
    opts.paymentIntentId,
    opts.amountCents != null ? { amount_to_capture: opts.amountCents } : undefined,
    { idempotencyKey: `capture:${opts.bookingId}:${opts.amountCents ?? "full"}` },
  );

  const amount = (captured.amount_received ?? opts.amountCents ?? captured.amount) / 100;
  const admin = svc();
  const { error } = await admin
    .from("bookings")
    .update({ payment_status: "paid" as const, captured_at: new Date().toISOString() })
    .eq("id", opts.bookingId);
  if (error) {
    // The money HAS moved — never surface this as a failed capture.
    console.error(`[payments] captured ${captured.id} but booking update failed:`, error.message);
  }

  const { error: payErr } = await admin.from("payments").insert({
    booking_id: opts.bookingId,
    amount,
    currency: (opts.currency ?? captured.currency ?? "cad").toUpperCase(),
    status: "paid" as const,
    stripe_id: captured.id,
  });
  if (payErr) console.error("[payments] ledger insert failed:", payErr.message);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return captured.id;
}

/**
 * Release a hold without taking anything — a free cancellation on an authorized
 * booking. Cancelling the intent returns the funds immediately, which is
 * strictly better for the customer than capturing and refunding.
 */
export async function releaseBookingHold(bookingId: string, paymentIntentId: string | null) {
  if (!paymentIntentId?.startsWith("pi_")) return;
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "requires_capture") return;
    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: "requested_by_customer" });
  } catch (err) {
    console.error(`[payments] releasing hold for booking ${bookingId} failed:`, err);
  }
}

/**
 * Idempotent "payment landed" write, shared by the Stripe webhook and
 * verifyCheckoutSessionAction — whichever runs first wins; the loser is a
 * no-op. The conditional update on payment_status='pending' is the
 * idempotency gate: only the winner inserts the payments row and fires
 * the notifications.
 */
export async function markBookingPaid(opts: {
  bookingId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  /** Driver tip in cents, from the SERVER-created session metadata (never client input). */
  tipCents?: number;
}): Promise<{ alreadyPaid: boolean }> {
  const admin = svc();

  // Belt-and-suspenders: the DB also enforces tip >= 0.
  const tip = Math.max(0, Math.round(Number(opts.tipCents ?? 0))) / 100;

  const { data, error } = await admin
    .from("bookings")
    .update({ payment_status: "paid" as const, stripe_payment_id: opts.paymentIntentId, tip })
    .eq("id", opts.bookingId)
    .eq("payment_status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { alreadyPaid: true };

  // Ledger row: records the amount actually charged (paid-at = created_at).
  const { error: payErr } = await admin.from("payments").insert({
    booking_id: opts.bookingId,
    amount: opts.amountCents / 100,
    currency: opts.currency.toUpperCase(),
    status: "paid" as const,
    stripe_id: opts.paymentIntentId,
  });
  if (payErr) console.error("[payments] ledger insert failed:", payErr.message);

  const amount = `$${(opts.amountCents / 100).toFixed(2)} ${opts.currency.toUpperCase()}`;
  const tipStr = tip > 0 ? `$${tip.toFixed(2)} ${opts.currency.toUpperCase()}` : "";
  after(() => notifyPaymentReceived(opts.bookingId, { amount, paymentRef: opts.paymentIntentId, tip: tipStr }));
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { alreadyPaid: false };
}
