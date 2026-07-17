/**
 * When a booking's funds can be HELD rather than charged.
 *
 * Split out of payments.ts because that module is `server-only` (it holds the
 * Stripe secret client), while the payment dialog needs the same rule to label
 * its button honestly. Pure and isomorphic — no Stripe, no DB.
 */

/**
 * How long a card authorization can be relied on.
 *
 * Stripe holds an uncaptured authorization for about 7 days, but this is a
 * card-network property rather than a Stripe setting: some issuers release the
 * hold sooner, and capturing after it lapses fails. 6 days leaves a margin.
 *
 * This is the hard limit on "hold at booking, capture after the ride". Weddings
 * and proms — the bookings with the largest amounts — are routinely booked
 * months ahead, and no authorization survives that, so those are charged up
 * front instead and told so at checkout.
 *
 * The robust fix for advance bookings is to save the card at booking
 * (setup_future_usage) and charge it off-session shortly before pickup. That
 * needs its own build: off-session charges can be declined or require
 * authentication, so it also needs a retry-and-chase flow.
 */
export const AUTH_HOLD_WINDOW_DAYS = 6;

/** Whether a pickup is close enough that a hold placed now will survive to it. */
export function canHoldUntil(pickupInstantMs: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(pickupInstantMs)) return false;
  const days = (pickupInstantMs - now) / 86_400_000;
  return days <= AUTH_HOLD_WINDOW_DAYS;
}
