/**
 * Customer cancellation penalties.
 *
 * Client instruction (14 Jul 2026), verbatim: "cancellation penalty - 25% 12
 * hours before pickup, 50% 6 hours before pickup, 75% 15 minutes before pickup,
 * 100% 0 minutes before pickup". Read as a ladder on time remaining, with
 * anything earlier than the widest tier free of charge.
 *
 * NOTE — this supersedes an earlier policy from the same client thread (6 Jul:
 * full refund beyond 24h, 50% at 12-24h, nothing inside 12h) which is what the
 * FAQ still described. The two disagree sharply: at 8 hours out the old policy
 * refunds nothing while this one refunds half. The newer instruction wins and
 * the FAQ has been rewritten to match, but it is worth an explicit confirmation
 * with the client since both were approved at different times.
 *
 * Not covered by this ladder and still unimplemented: the separate special-event
 * terms (weddings/proms — 25% non-refundable deposit, 30/15-day tiers).
 */

import { minutesUntilPickup } from "@/lib/datetime";
import { round2 } from "@/lib/pricing";

export interface CancellationTier {
  /** Cancelling with this many minutes or fewer left charges `rate`. */
  withinMinutes: number;
  rate: number;
  label: string;
}

/** Ascending by window — the first match wins, so keep it sorted. */
export const CANCELLATION_TIERS: CancellationTier[] = [
  { withinMinutes: 0, rate: 1.0, label: "at or after the pickup time" },
  { withinMinutes: 15, rate: 0.75, label: "within 15 minutes of pickup" },
  { withinMinutes: 6 * 60, rate: 0.5, label: "within 6 hours of pickup" },
  { withinMinutes: 12 * 60, rate: 0.25, label: "within 12 hours of pickup" },
];

/** Widest tier — cancelling earlier than this is free. */
export const FREE_CANCELLATION_MINUTES = CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1].withinMinutes;

export interface CancellationTerms {
  /** Fraction of the taxed fare kept as a penalty (0 = free cancellation). */
  rate: number;
  /** Human-readable reason for the rate, for UI and emails. */
  label: string;
  minutesUntilPickup: number;
}

/** Which penalty applies to cancelling a pickup right now. */
export function cancellationTerms(pickupDatetime: string, now: number = Date.now()): CancellationTerms {
  const mins = minutesUntilPickup(pickupDatetime, now);
  // An unparseable pickup must not silently charge 100% — treat it as free and
  // let a human sort it out.
  if (!Number.isFinite(mins)) {
    return { rate: 0, label: "no penalty", minutesUntilPickup: NaN };
  }
  for (const tier of CANCELLATION_TIERS) {
    if (mins <= tier.withinMinutes) {
      return { rate: tier.rate, label: `${tier.rate * 100}% — cancelled ${tier.label}`, minutesUntilPickup: mins };
    }
  }
  return { rate: 0, label: "free cancellation — more than 12 hours before pickup", minutesUntilPickup: mins };
}

export interface RefundQuote extends CancellationTerms {
  /** What the customer actually paid: fare + HST + tip. */
  chargedTotal: number;
  /** Penalty kept by the business. */
  penalty: number;
  /** Returned to the customer. */
  refund: number;
}

/**
 * Split a paid booking into penalty vs refund.
 *
 * The penalty applies to the taxed fare (fare + HST): a cancellation fee is
 * itself a taxable supply in Ontario, so keeping 25% of the fare means keeping
 * 25% of its tax too. The tip is ALWAYS refunded in full — no chauffeur drove,
 * so there is no gratuity to keep, even on a 100% no-show penalty.
 */
export function refundQuote(
  booking: { pickup_datetime: string; fare_estimate: number | string; tax_amount?: number | string | null; tip?: number | string | null },
  now: number = Date.now(),
): RefundQuote {
  const terms = cancellationTerms(booking.pickup_datetime, now);
  const fare = Number(booking.fare_estimate) || 0;
  const tax = Number(booking.tax_amount ?? 0) || 0;
  const tip = Math.max(0, Number(booking.tip ?? 0) || 0);

  const chargedTotal = round2(fare + tax + tip);
  const penalty = round2((fare + tax) * terms.rate);
  const refund = round2(Math.max(0, chargedTotal - penalty));
  return { ...terms, chargedTotal, penalty, refund };
}
