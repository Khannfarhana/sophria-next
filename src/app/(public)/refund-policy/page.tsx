import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { CANCELLATION_TIERS } from "@/lib/cancellation";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How cancellations, cancellation fees and refunds work for SophRia Limousine Services bookings.",
};

/**
 * The published refund policy.
 *
 * The ladder below is GENERATED from CANCELLATION_TIERS — the same constant
 * cancelBookingAction charges against. That is deliberate: the previous policy
 * lived as hand-written prose in a single FAQ answer and described a completely
 * different set of tiers to the ones the code applied (in fact the code applied
 * none at all and refunded nothing). Prose and behaviour cannot drift here
 * without someone editing the tiers themselves.
 */

const ladder = [...CANCELLATION_TIERS]
  .sort((a, b) => b.withinMinutes - a.withinMinutes)
  .map((t) => `Cancelled ${t.label} — a ${Math.round(t.rate * 100)}% cancellation fee applies.`);

const SECTIONS: LegalSection[] = [
  {
    h: "1. Cancelling a ride",
    p: [
      "You can cancel any booking from your dashboard up until the chauffeur is on the way. Cancel more than 12 hours before your pickup time and there is no charge — you are refunded in full.",
      "Inside 12 hours a cancellation fee applies on a sliding scale, because the vehicle and chauffeur have already been committed to your booking and can no longer be offered to anyone else:",
    ],
    li: ["More than 12 hours before pickup — free, refunded in full.", ...ladder],
  },
  {
    h: "2. How the fee is calculated",
    p: [
      "The fee is a percentage of your fare including its HST. For example, on a $170 fare with $22.10 HST — $192.10 in total — cancelling 10 hours before pickup is a 25% fee of $48.03.",
      "Your gratuity is always refunded in full, at every tier, including a 100% no-show. No chauffeur drove, so there is no tip to keep.",
    ],
  },
  {
    h: "3. No-shows",
    p: [
      "A booking is treated as a no-show if you cannot be reached and do not arrive at the pickup location within the included waiting time. A no-show is charged at 100% of the fare, and the same rule about gratuity applies — the tip is returned.",
    ],
  },
  {
    h: "4. Airport pickups and flight delays",
    p: [
      "Where you give us a flight number at booking, we track the flight and adjust the pickup to the actual arrival time at no charge.",
      "Waiting charges may apply for delays unrelated to the airline, or where incorrect flight details were provided.",
    ],
  },
  {
    h: "5. Special events",
    p: [
      "Weddings, proms, graduations, concerts, sporting events, corporate events and similar reserved bookings are quoted and scheduled well in advance, and have their own terms.",
      "These bookings require a non-refundable deposit and are subject to separate cancellation windows. Special-event bookings are arranged with dispatch directly — the terms are confirmed with you in writing at the time of booking, and they override the ladder above.",
    ],
  },
  {
    h: "6. If we cancel",
    p: [
      "If we cannot provide your booked service — a vehicle breakdown, severe weather, or another circumstance outside our control — and we cannot arrange a suitable replacement, you receive a full refund with no fee, including any gratuity.",
    ],
  },
  {
    h: "7. Changes to a booking",
    p: [
      "You can change your pickup or drop-off from your dashboard before payment; the fare is recalculated automatically and shown to you before you pay. Date and time changes are subject to availability — contact dispatch.",
      "A change is not a cancellation. If a change is not possible and you cancel instead, the ladder above applies from the time you cancel.",
    ],
  },
  {
    h: "8. How refunds reach you",
    p: [
      "Refunds are issued automatically to your original payment method the moment you cancel — you do not need to request one. Depending on your bank, funds typically appear within 5–10 business days.",
      "If the amount refunded does not look right, contact us with your booking reference and we will reconcile it.",
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund &"
      accent="Cancellation Policy."
      updated="Last updated 16 July 2026"
      intro={`This policy applies to all bookings with ${SITE.fullName}. By confirming a reservation you acknowledge that you have read and agree to it.`}
      sections={SECTIONS}
    />
  );
}
