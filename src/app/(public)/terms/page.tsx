import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site-config";
import { HST_RATE, YYZ_AIRPORT_FEE, HOURLY_MIN_HOURS, DEFAULT_TIP_RATE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you book a chauffeur with SophRia Limousine Services.",
};

/**
 * Passenger-facing terms.
 *
 * NOT LEGAL ADVICE and not reviewed by counsel. The pricing and payment
 * sections are pulled from the same constants the fare engine uses, so the
 * published terms cannot quietly disagree with what the customer is charged —
 * which is exactly what happened before, when the site advertised 13% HST that
 * the engine never applied.
 */

const SECTIONS: LegalSection[] = [
  {
    h: "1. These terms",
    p: [
      `These terms apply when you book ground transportation with ${SITE.fullName} (${SITE.legalName}). By confirming a reservation you agree to them.`,
      "They work alongside our Refund & Cancellation Policy and our Privacy Policy, both linked below.",
    ],
  },
  {
    h: "2. Booking",
    p: [
      "A booking is a request until our dispatch confirms it. Once confirmed you'll receive a secure payment link, and a chauffeur is assigned after payment clears.",
      "You are responsible for the accuracy of what you give us — pickup and drop-off addresses, date and time, passenger count, and flight number for airport pickups. Incorrect details may mean we cannot complete the ride, and the cancellation policy would then apply.",
    ],
  },
  {
    h: "3. Fares, tax and fees",
    p: [
      `Fares are quoted in Canadian dollars and shown in full before you pay, itemised into the fare, any airport fee, and HST at ${HST_RATE * 100}%. HST applies to every ride.`,
      `Airport pickups and drop-offs carry a $${YYZ_AIRPORT_FEE.toFixed(2)} airport fee, shown as its own line. Trips to and from Toronto Pearson are priced from the official airport limousine tariff.`,
      `Hourly bookings have a ${HOURLY_MIN_HOURS}-hour minimum.`,
      "Highway tolls (including Highway 407), parking, waiting time beyond the complimentary period, and additional stops are charged where they apply. Excessive cleaning or damage to the vehicle may be charged separately.",
      "Where dispatch adjusts a fare before payment, you are told the new amount and the reason before you are asked to pay it.",
    ],
  },
  {
    h: "4. Gratuity",
    p: [
      `Gratuity is separate from the fare and entirely your choice. ${DEFAULT_TIP_RATE * 100}% of the pre-tax fare is suggested at payment; you can change it or remove it. 100% of any tip goes to your chauffeur.`,
    ],
  },
  {
    h: "5. Payment",
    p: [
      "Payment is taken online through Stripe before a chauffeur is assigned. We do not store your card details.",
      "Corporate accounts with monthly billing are available on approval — contact dispatch.",
    ],
  },
  {
    h: "6. Cancellations",
    p: [
      "Cancelling more than 12 hours before pickup is free. Inside that window a cancellation fee applies on a sliding scale, and a no-show is charged in full. Gratuity is always refunded.",
      "The full ladder, worked examples and the special-event terms are in our Refund & Cancellation Policy.",
    ],
  },
  {
    h: "7. Waiting time",
    p: [
      "A complimentary waiting period is included with each booking. Beyond it, waiting is billed at the applicable hourly rate.",
      "For airport pickups where you've given us a flight number, we track the flight and start the waiting period from the actual arrival.",
    ],
  },
  {
    h: "8. Conduct in the vehicle",
    li: [
      "Seatbelts must be worn by every passenger, and legally required child seats are your responsibility to arrange unless agreed with dispatch in advance.",
      "No smoking or vaping in any vehicle.",
      "No illegal substances, and no behaviour that endangers the chauffeur or other road users.",
      "The number of passengers must not exceed the vehicle's stated capacity.",
      "A chauffeur may end a ride where a passenger's conduct is unsafe, unlawful, or abusive. No refund is due in that case.",
    ],
  },
  {
    h: "9. Our chauffeurs",
    p: [
      "Rides are performed either by our own fleet or by vetted partner chauffeurs driving their own licensed and insured vehicles. Every chauffeur is licensed to drive for hire, carries commercial insurance, and has passed a background check.",
      "We may substitute a vehicle of equivalent or higher class where necessary, at no extra charge to you.",
    ],
  },
  {
    h: "10. Liability",
    p: [
      "We are responsible for providing the service with reasonable skill and care. We are not liable for delays caused by traffic, weather, road closures, border crossings, or other circumstances outside our control, nor for consequential losses such as a missed flight or a missed connection.",
      "Personal property is your responsibility. Tell us immediately if you leave something behind and we will try to recover it, but we cannot guarantee it.",
      "Nothing in these terms limits liability that cannot be limited under Ontario law, including for death or personal injury caused by negligence.",
    ],
  },
  {
    h: "11. Governing law",
    p: [
      "These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there. Cross-border trips remain subject to the laws of the jurisdictions travelled through.",
    ],
  },
  {
    h: "12. Changes",
    p: [
      "We may update these terms. The version that applies to your ride is the one published when you confirmed your booking.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of"
      accent="Service."
      updated="Last updated 16 July 2026"
      intro={`These terms apply when you book ground transportation with ${SITE.fullName}.`}
      sections={SECTIONS}
      footnote={
        <>
          See also our{" "}
          <Link href="/refund-policy" className="font-medium text-foreground underline underline-offset-2">
            Refund &amp; Cancellation Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          . Questions? Contact{" "}
          <a href={SITE.emailHref} className="font-medium text-foreground underline underline-offset-2">
            {SITE.email}
          </a>{" "}
          or call{" "}
          <a href={SITE.phoneHref} className="font-medium text-foreground underline underline-offset-2">
            {SITE.phone}
          </a>
          .
        </>
      }
    />
  );
}
