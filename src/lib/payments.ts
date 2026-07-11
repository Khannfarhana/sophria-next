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
