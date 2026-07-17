import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site-config";
import { CHAUFFEUR_TERMS_VERSION, MIN_EXPERIENCE_YEARS } from "@/lib/driver-application";
import { DEFAULT_DRIVER_PAYOUT_RATE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Chauffeur Terms",
  description:
    "The terms that apply to independent chauffeurs driving with SophRia — eligibility, responsibilities, payment and commission.",
};

/**
 * Driver-facing terms, referenced by the acceptance checkbox on
 * /become-chauffeur and versioned by CHAUFFEUR_TERMS_VERSION — bump that
 * constant whenever the substance here changes, so consent already recorded
 * isn't silently reinterpreted.
 *
 * NOT LEGAL ADVICE and not a lawyer-reviewed document. The client asked for
 * terms making clear that drivers carry responsibility, and supplied a 14-page
 * subcontractor chauffeur agreement as reference material. This states the
 * operating terms the platform actually enforces in code (eligibility, the
 * commission split, payout timing, document currency); it should be reviewed by
 * counsel before it is relied on, and it does not replace the signed
 * subcontractor agreement.
 */

const driverPct = Math.round(DEFAULT_DRIVER_PAYOUT_RATE * 100);

const SECTIONS: LegalSection[] = [
  {
    h: "1. Who can drive",
    li: [
      `A full Ontario G licence, held for at least ${MIN_EXPERIENCE_YEARS} years.`,
      "A valid licence to operate as a vehicle-for-hire driver.",
      "The right to work in Canada, and a clean background check and driver's abstract.",
      "A late-model luxury sedan or SUV carrying a limousine plate, registered to you.",
      "A valid safety certificate and commercial insurance in good standing.",
    ],
  },
  {
    h: "2. Independent contractor",
    p: [
      "You drive as an independent contractor, not an employee of SophRia. You decide when you are available and you may accept or decline any ride.",
      "Nothing in these terms creates an employment, partnership or agency relationship. You are responsible for your own taxes, including registering for and remitting HST where required, and for your own business expenses.",
    ],
  },
  {
    h: "3. Your vehicle is your responsibility",
    p: [
      "You are responsible for your vehicle at all times: its condition, maintenance, cleanliness, safety, fuel, tolls, parking, and any fines or penalties incurred while driving.",
      "You must maintain commercial insurance covering passengers for hire for as long as you drive with SophRia. Personal auto insurance is not sufficient.",
      "You must tell us immediately if your licence, plate, insurance or safety certificate lapses, is suspended, or is cancelled. Driving without current documents is a serious breach and ends the arrangement.",
    ],
  },
  {
    h: "4. Documents and verification",
    p: [
      "Every document you provide must be genuine, current and yours. SophRia may verify them at any time, directly or through a third party, and may request updated copies.",
      "We may decline an application, or suspend or end an existing arrangement, if documents are missing, expired, or cannot be verified — at our discretion, and without notice where passenger safety is involved.",
    ],
  },
  {
    h: "5. Standard of service",
    p: [
      "You will arrive on time, dressed professionally, and treat every passenger with courtesy and discretion.",
    ],
    li: [
      "No smoking or vaping in the vehicle.",
      "Never drive under the influence of alcohol or drugs, or use a handheld device while driving.",
      "Carry only the passengers on the booking.",
      "Follow all applicable traffic, licensing and municipal by-laws in every jurisdiction you drive in, including on cross-border trips.",
    ],
  },
  {
    h: "6. Rides, payment and commission",
    p: [
      "Rides are offered through the platform. Fares are set by SophRia and shown to the passenger before they book.",
      `SophRia charges a commission on the pre-tax fare of each completed ride. Your share is ${driverPct}% by default and is shown in your driver portal. Your payout is fixed when the ride is assigned to you and does not change afterwards, even if the rate changes later.`,
      "Tips are yours in full — SophRia takes no commission on gratuity.",
      "You are paid after a ride is completed. HST charged to the passenger belongs to the tax authority, is not part of your payout, and is not yours to keep.",
    ],
  },
  {
    h: "7. Cancellations and no-shows",
    p: [
      "If you cannot make an assigned ride, tell dispatch as early as possible so the passenger can be re-covered. Repeatedly accepting and then dropping rides may end the arrangement.",
      "Where a passenger cancels, our Refund & Cancellation Policy applies to them. A cancelled ride is not payable to you unless dispatch confirms otherwise.",
    ],
  },
  {
    h: "8. Liability",
    p: [
      "You are responsible for loss, damage, injury or claims arising from your driving, your vehicle, or your failure to hold the licences and insurance these terms require.",
      "SophRia is not liable for your lost earnings, vehicle downtime, or indirect losses. Nothing here limits liability that cannot be limited by law.",
    ],
  },
  {
    h: "9. Ending the arrangement",
    p: [
      "You may stop driving at any time. SophRia may end the arrangement at any time, and immediately where there is a safety, licensing, insurance or conduct concern.",
      "Any rides already assigned to you should be completed, or handed back to dispatch in good time.",
    ],
  },
  {
    h: "10. Changes to these terms",
    p: [
      "We may update these terms. Material changes are versioned, and we may ask you to accept the new version before you continue driving.",
    ],
  },
];

export default function ChauffeurTermsPage() {
  return (
    <LegalPage
      title="Chauffeur"
      accent="Terms."
      updated={`Version ${CHAUFFEUR_TERMS_VERSION}`}
      intro={`These terms apply to independent chauffeurs driving with ${SITE.fullName}.`}
      sections={SECTIONS}
      footnote={
        <>
          These terms sit alongside any subcontractor chauffeur agreement you sign with {SITE.fullName}. Where the two
          conflict, the signed agreement governs. Questions? Email{" "}
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
