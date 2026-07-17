import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { settleCheckoutSession, releaseAuthorizedBooking } from "@/lib/payments";

// Raw-body signature verification needs the Node runtime.
export const runtime = "nodejs";

/**
 * A booking_id we can actually look up.
 *
 * Our checkout flow always writes a real uuid, but this endpoint accepts any
 * event Stripe signs — `stripe trigger` fixtures, test objects, and intents
 * created outside the booking flow can carry a booking_id that is not a uuid
 * (or none at all). Postgres rejects a malformed uuid, which threw, which
 * returned 5xx, which made Stripe retry the same doomed event on a backoff
 * forever. Such an id will never become valid, so it is "not ours" — 200 it and
 * move on, exactly as the no-booking_id case already did. A genuine DB failure
 * still throws and still earns a retry, which is the distinction that matters.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function bookingIdOf(metadata: Stripe.Metadata | null | undefined): string | null {
  const id = metadata?.booking_id;
  return id && UUID_RE.test(id) ? id : null;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    // Cards complete synchronously; async_payment_succeeded covers
    // delayed payment methods if they're ever enabled.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      // No usable booking_id (e.g. `stripe trigger` fixtures) → 200 no-op so
      // Stripe doesn't retry. A DB failure throws → 5xx → Stripe retries.
      //
      // The payment_status === "paid" gate that used to live here is gone on
      // purpose: a manual-capture session stays "unpaid" until capture, so that
      // check silently dropped every held booking. settleCheckoutSession reads
      // the PaymentIntent instead and routes to authorized-vs-paid itself.
      if (bookingIdOf(s.metadata)) await settleCheckoutSession(s);
      break;
    }

    // A hold that stops being a hold. Card authorizations live ~7 days and
    // issuers release them early; Stripe also cancels an uncaptured intent
    // once it expires. Without this, payment_status sat at 'authorized'
    // forever: assignDriverAction accepts 'authorized' as secured funds, so
    // the ride dispatched and completed against money that was no longer
    // there, and the only trace was a capture failure in the logs.
    //
    // Move it back to 'pending' — the honest state (no funds are held) and the
    // one the payment-request flow already knows how to chase. Guarded on
    // 'authorized' so it can never clobber a booking that has since been
    // captured ('paid'), which matters because Stripe fires
    // payment_intent.canceled on the release path of a free cancellation too.
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = bookingIdOf(pi.metadata);
      if (!bookingId) break;
      await releaseAuthorizedBooking(bookingId, pi.id);
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
