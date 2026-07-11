import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { markBookingPaid } from "@/lib/payments";

// Raw-body signature verification needs the Node runtime.
export const runtime = "nodejs";

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
      const bookingId = s.metadata?.booking_id;
      // No booking_id (e.g. `stripe trigger` fixtures) → 200 no-op so
      // Stripe doesn't retry. A DB failure throws → 5xx → Stripe retries.
      if (bookingId && s.payment_status === "paid") {
        await markBookingPaid({
          bookingId,
          paymentIntentId:
            typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id,
          amountCents: s.amount_total ?? 0,
          currency: s.currency ?? "cad",
        });
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
