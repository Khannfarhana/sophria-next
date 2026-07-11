import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Lazy singleton — mock-mode deployments have no key, so only throw on use. */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}
