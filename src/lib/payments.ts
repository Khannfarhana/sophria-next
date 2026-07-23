import "server-only";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/stripe";
import { notifyPaymentReceived, notifyPaymentHoldReleased, notifyDuplicatePaymentRefunded } from "@/lib/mailer/notifications";

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
 *
 * Auto-paginates. It used to take a single page of 100 open sessions
 * ACCOUNT-WIDE and filter in JS, so the session it exists to kill was missed
 * whenever more than 100 open sessions existed — a busy day of abandoned
 * checkouts. The customer could then open their still-live tab and pay the OLD
 * fare: admin corrects $200 -> $350, customer pays $200, settleCheckoutSession
 * marks it paid, $150 gone with nothing logged. Stripe cannot filter list() by
 * metadata, so paging the whole set is the only way to be sure.
 */
export async function expireOpenCheckoutSessions(bookingId: string) {
  try {
    const stripe = getStripe();
    let scanned = 0;
    let expired = 0;
    // autoPagingEach walks every page, not just the first.
    for await (const s of stripe.checkout.sessions.list({ status: "open", limit: 100 })) {
      scanned++;
      if (s.metadata?.booking_id === bookingId) {
        await stripe.checkout.sessions.expire(s.id);
        expired++;
      }
    }
    if (expired === 0 && scanned > 0) {
      // Not an error: usually the customer simply never opened checkout.
      console.info(`[payments] no open checkout session for booking ${bookingId} (scanned ${scanned})`);
    }
  } catch (err) {
    // Swallowed because this runs inside after() on a best-effort path — but a
    // failure here means a stale, cheaper session may still be payable, so it
    // must be loud enough to find.
    console.error(`[payments] expiring open checkout sessions for booking ${bookingId} failed:`, err);
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
 * A hold that no longer exists: put the booking back to 'pending'.
 *
 * Driven by the payment_intent.canceled webhook. A card authorization lives
 * ~7 days, issuers release early, and Stripe cancels an uncaptured intent when
 * it expires — but nothing watched for it, so payment_status stayed
 * 'authorized' indefinitely. assignDriverAction treats 'authorized' as secured
 * funds, so the ride kept dispatching against money that was already gone, and
 * the first sign of trouble was a capture failure after the ride had been
 * driven. That is a free ride.
 *
 * Three guards, each load-bearing:
 *   payment_status = 'authorized' — never touch a booking already captured
 *     ('paid'); the capture path also cancels nothing, but a stale webhook
 *     retry must not undo a settled payment.
 *   stripe_payment_id = the cancelled intent — if the customer has since paid
 *     again, that is a DIFFERENT intent and this event is about a dead one.
 *   status not terminal — a FREE CANCELLATION cancels the intent itself
 *     (releaseBookingHold), which fires this same event. That booking is
 *     already cancelled and correctly settled; marking it "pending payment"
 *     would tell the customer they still owe for a ride they cancelled.
 */
export async function releaseAuthorizedBooking(bookingId: string, paymentIntentId: string): Promise<void> {
  const admin = svc();
  const { data, error } = await admin
    .from("bookings")
    .update({
      payment_status: "pending" as const,
      authorized_at: null,
      auth_expires_at: null,
    })
    .eq("id", bookingId)
    .eq("payment_status", "authorized")
    .eq("stripe_payment_id", paymentIntentId)
    .not("status", "in", "(cancelled,rejected,completed)")
    .select("id, status");

  if (error) {
    // Throwing gives Stripe a 5xx and a retry, which is what we want: leaving a
    // booking marked as funded when it isn't is the failure being fixed here.
    throw new Error(`releaseAuthorizedBooking(${bookingId}): ${error.message}`);
  }
  if (!data || data.length === 0) return; // already cancelled, captured, or re-paid

  console.warn(`[payments] hold released before the ride for booking ${bookingId} (${paymentIntentId}) — back to pending`);
  after(() => notifyPaymentHoldReleased(bookingId));
  revalidatePath("/admin");
  revalidatePath("/dashboard");
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

/**
 * Turn a completed Checkout session into the right booking state. Shared by the
 * webhook and the success-redirect, either of which may land first.
 *
 * The subtlety: for a manual-capture session Stripe leaves
 * `session.payment_status` as "unpaid" until you capture, because nothing has
 * been charged. Gating on `payment_status === "paid"` — as this did — silently
 * ignores every held booking. The PaymentIntent's status is the truth:
 * `requires_capture` means the funds are held.
 *
 * This lives in this server-only module rather than payment-actions.ts because
 * EVERY export of a "use server" file is a public POST endpoint, and this
 * function takes the Stripe session as an argument and writes payment state
 * under the service role. Exported from there, an attacker could POST a forged
 * `{payment_status:"paid", metadata:{booking_id}}` and mark any booking paid.
 * Its callers must establish trust first: the webhook by verifying Stripe's
 * signature, verifyCheckoutSessionAction by retrieving the session from Stripe
 * and checking ownership.
 */
/**
 * A charge landed on a booking whose payment state was ALREADY settled by a
 * different payment. Two ways this genuinely happens:
 *
 *   - two live sessions for one booking (e.g. a full-fare session opened, then
 *     the deposit paid; the stale full session stays payable for up to 24h)
 *   - the balance paid online in an open tab moments after the driver
 *     collected it in cash and completed the ride
 *
 * The conditional mark* writes correctly refuse the second write — but the
 * money HAS been charged, and refusing the write used to be the end of it: an
 * unrecorded charge, invisible everywhere. Distinguish the benign case (the
 * webhook and the success-redirect settling the SAME payment — its intent is
 * in the ledger) from real duplicates, refund the duplicate outright, and tell
 * an admin.
 */
async function reconcileOrphanCharge(bookingId: string, paymentIntentId: string, kind: string): Promise<void> {
  try {
    const admin = svc();
    // Benign twin detection FIRST, and against the booking row rather than the
    // ledger alone: the webhook and the success-redirect settle the same
    // session near-simultaneously, and the winner's claim UPDATE (which
    // records stripe_payment_id / balance_method atomically) lands before its
    // ledger insert. Checking only the ledger in that gap would refund a
    // legitimate payment.
    const { data: bk } = await admin
      .from("bookings")
      .select("stripe_payment_id, balance_method")
      .eq("id", bookingId)
      .single();
    if (bk?.stripe_payment_id === paymentIntentId) return; // same payment, settled twice
    // Balance twin: the claim doesn't store the balance intent, but a cash
    // double-collection — the case this exists for — always shows 'cash' here.
    if (kind === "balance" && bk?.balance_method === "online") return;

    const { data } = await admin.from("payments").select("id").eq("stripe_id", paymentIntentId).limit(1);
    if (data && data.length > 0) return; // recorded in the ledger — nothing owed

    let detail = `A second ${kind} payment (${paymentIntentId}) arrived after this booking was already settled.`;
    if (paymentIntentId.startsWith("pi_")) {
      await getStripe().refunds.create(
        {
          payment_intent: paymentIntentId,
          reason: "duplicate",
          metadata: { booking_id: bookingId, duplicate_of: kind },
        },
        { idempotencyKey: `orphan:${paymentIntentId}` },
      );
      detail += " It has been refunded in full.";
      console.error(`[payments] duplicate ${kind} charge on booking ${bookingId} refunded (${paymentIntentId})`);
    } else {
      detail += " It could NOT be auto-refunded (no payment intent id) — refund it by hand.";
      console.error(`[payments] duplicate ${kind} charge on booking ${bookingId} is not refundable automatically (${paymentIntentId})`);
    }
    after(() => notifyDuplicatePaymentRefunded(bookingId, detail));
  } catch (err) {
    // The refund failing must be loud: this exact charge is recorded nowhere.
    console.error(`[payments] FAILED to refund duplicate ${kind} charge ${paymentIntentId} on booking ${bookingId}:`, err);
    after(() =>
      notifyDuplicatePaymentRefunded(
        bookingId,
        `A duplicate ${kind} payment (${paymentIntentId}) arrived after settlement and the automatic refund FAILED — refund it by hand.`,
      ),
    );
  }
}

export async function settleCheckoutSession(
  checkout: Stripe.Checkout.Session,
): Promise<{ paid: boolean; held?: boolean }> {
  const bookingId = checkout.metadata?.booking_id;
  if (!bookingId) return { paid: false };

  const paymentIntentId =
    typeof checkout.payment_intent === "string" ? checkout.payment_intent : checkout.payment_intent?.id ?? null;
  const tipCents = Math.max(0, Number(checkout.metadata?.tip_cents ?? 0) || 0);
  // Which leg this session is: full fare (default), a reservation deposit, or
  // the later balance payment on a deposit booking. Server-created metadata.
  const purpose = checkout.metadata?.purpose ?? "full";

  // Deposit and balance sessions are always immediate charges — no hold branch.
  if (purpose === "deposit" || purpose === "balance") {
    if (checkout.payment_status !== "paid") return { paid: false };
    if (purpose === "deposit") {
      const r = await markBookingDepositPaid({
        bookingId,
        paymentIntentId: paymentIntentId ?? checkout.id,
        depositCents: Number(checkout.metadata?.deposit_cents ?? checkout.amount_total ?? 0),
        balanceCents: Number(checkout.metadata?.balance_cents ?? 0),
        currency: checkout.currency ?? "cad",
      });
      if (r.alreadyPaid) await reconcileOrphanCharge(bookingId, paymentIntentId ?? checkout.id, "deposit");
    } else {
      const r = await markBookingBalancePaid({
        bookingId,
        paymentIntentId: paymentIntentId ?? checkout.id,
        amountCents: checkout.amount_total ?? 0,
        currency: checkout.currency ?? "cad",
        tipCents,
      });
      // The classic race: balance paid online in an open tab right after the
      // chauffeur collected it in cash — the customer must not pay twice.
      if (r.alreadyPaid) await reconcileOrphanCharge(bookingId, paymentIntentId ?? checkout.id, "balance");
    }
    return { paid: true, held: false };
  }

  if (paymentIntentId) {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "requires_capture") {
      const r = await markBookingAuthorized({ bookingId, paymentIntentId, tipCents });
      if (r.already) {
        // Nothing was charged (it's a hold), but a DUPLICATE hold parks the
        // customer's money for ~7 days. Same-intent double-settle is benign;
        // a different intent means a second live session was paid — release it.
        const admin = svc();
        const { data: bk } = await admin.from("bookings").select("stripe_payment_id").eq("id", bookingId).single();
        if (bk && bk.stripe_payment_id !== paymentIntentId) {
          console.error(`[payments] duplicate hold on booking ${bookingId} — cancelling ${paymentIntentId}`);
          await releaseBookingHold(bookingId, paymentIntentId);
          after(() =>
            notifyDuplicatePaymentRefunded(
              bookingId,
              `A second card hold (${paymentIntentId}) was placed after this booking was already funded; the duplicate hold has been released.`,
            ),
          );
        }
      }
      return { paid: true, held: true };
    }
  }

  // Immediate-capture path (booking beyond the hold window, or a legacy session).
  if (checkout.payment_status !== "paid") return { paid: false };
  const r = await markBookingPaid({
    bookingId,
    paymentIntentId: paymentIntentId ?? checkout.id,
    amountCents: checkout.amount_total ?? 0,
    currency: checkout.currency ?? "cad",
    tipCents,
  });
  if (r.alreadyPaid) await reconcileOrphanCharge(bookingId, paymentIntentId ?? checkout.id, "payment");
  return { paid: true, held: false };
}

/**
 * Idempotent "deposit landed" write. The booking becomes dispatchable
 * (payment_status 'paid' — the dispatch wall's meaning of paid is "funds
 * secured", and the platform's share IS secured); the outstanding chauffeur
 * share is recorded in balance_due for cash or online settlement later.
 */
export async function markBookingDepositPaid(opts: {
  bookingId: string;
  paymentIntentId: string;
  depositCents: number;
  balanceCents: number;
  currency: string;
}): Promise<{ alreadyPaid: boolean }> {
  const admin = svc();
  const deposit = Math.max(0, Math.round(opts.depositCents)) / 100;
  const balance = Math.max(0, Math.round(opts.balanceCents)) / 100;

  const { data, error } = await admin
    .from("bookings")
    .update({
      payment_status: "paid" as const,
      payment_mode: "deposit",
      deposit_amount: deposit,
      balance_due: balance,
      stripe_payment_id: opts.paymentIntentId,
    })
    .eq("id", opts.bookingId)
    .eq("payment_status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { alreadyPaid: true };

  const { error: payErr } = await admin.from("payments").insert({
    booking_id: opts.bookingId,
    amount: deposit,
    currency: opts.currency.toUpperCase(),
    status: "paid" as const,
    stripe_id: opts.paymentIntentId,
  });
  if (payErr) console.error("[payments] deposit ledger insert failed:", payErr.message);

  const amount = `$${deposit.toFixed(2)} ${opts.currency.toUpperCase()} (deposit — $${balance.toFixed(2)} balance due to chauffeur)`;
  after(() => notifyPaymentReceived(opts.bookingId, { amount, paymentRef: opts.paymentIntentId, tip: "" }));
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { alreadyPaid: false };
}

/**
 * Idempotent "balance paid online" write for a deposit booking. The
 * balance_paid_at-null gate means an online payment and a cash collection at
 * the ride can race and exactly one wins.
 */
export async function markBookingBalancePaid(opts: {
  bookingId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  tipCents?: number;
}): Promise<{ alreadyPaid: boolean }> {
  const admin = svc();
  const tip = Math.max(0, Math.round(Number(opts.tipCents ?? 0))) / 100;

  const { data, error } = await admin
    .from("bookings")
    .update({
      balance_paid_at: new Date().toISOString(),
      balance_method: "online",
      // A deposit checkout has no tip step; the balance payment is where an
      // online tip for a deposit booking arrives.
      ...(tip > 0 ? { tip } : {}),
    })
    .eq("id", opts.bookingId)
    .eq("payment_mode", "deposit")
    .is("balance_paid_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { alreadyPaid: true };

  const { error: payErr } = await admin.from("payments").insert({
    booking_id: opts.bookingId,
    amount: opts.amountCents / 100,
    currency: opts.currency.toUpperCase(),
    status: "paid" as const,
    stripe_id: opts.paymentIntentId,
  });
  if (payErr) console.error("[payments] balance ledger insert failed:", payErr.message);

  const amount = `$${(opts.amountCents / 100).toFixed(2)} ${opts.currency.toUpperCase()} (balance)`;
  const tipStr = tip > 0 ? `$${tip.toFixed(2)} ${opts.currency.toUpperCase()}` : "";
  after(() => notifyPaymentReceived(opts.bookingId, { amount, paymentRef: opts.paymentIntentId, tip: tipStr }));
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { alreadyPaid: false };
}
