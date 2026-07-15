import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information SophRia Limousine Services collects, why, and what you can ask us to do with it.",
};

/**
 * Privacy policy.
 *
 * This route was already linked from the auth page ("By continuing you agree to
 * our Privacy Policy") and 404'd — it was the only legal link in the UI.
 *
 * NOT LEGAL ADVICE and not reviewed by counsel. It describes what the
 * application genuinely does today: the fields the booking and chauffeur forms
 * collect, the processors actually wired up (Supabase, Stripe, Mapbox, Google
 * OAuth, the mailer), and the PIPEDA rights that follow. Have it reviewed
 * before relying on it, and revisit it whenever a new processor is added.
 */

const SECTIONS: LegalSection[] = [
  {
    h: "1. Who we are",
    p: [
      `${SITE.fullName} (${SITE.legalName}) provides chauffeur and limousine services across the ${SITE.serviceArea}. We are the organisation responsible for the personal information described here.`,
      `You can reach us about privacy at ${SITE.email}, by phone on ${SITE.phone}, or by post at ${SITE.address.full}.`,
    ],
  },
  {
    h: "2. What we collect",
    li: [
      "Account details: your name, email address and phone number. If you sign in with Google, we receive your name, email and profile picture from Google — never your password.",
      "Booking details: pickup and drop-off addresses and their coordinates, date and time, trip type, vehicle chosen, passenger name and phone, flight number where given, and any notes you add.",
      "Payment details: handled by Stripe. We store the amount, the currency and a Stripe reference. We never see or store your full card number.",
      "Chauffeur applications: for applicants only — licence number and class, years of experience, work authorisation, languages, availability, vehicle details and limo plate, your photo, and the documents you upload (licence, insurance, ownership, safety, right to work, background-check consent, vehicle photos).",
      "Technical data: standard server logs, and errors captured when something breaks.",
    ],
  },
  {
    h: "3. Why we use it",
    li: [
      "To take and fulfil your booking, dispatch a chauffeur, and get you where you're going.",
      "To take payment, apply any cancellation fee, and issue refunds.",
      "To send you transactional email about your booking — confirmations, payment requests, driver assignment, completion. These are not marketing.",
      "To verify that a chauffeur applicant is licensed, insured and entitled to work, and to keep our passengers safe.",
      "To meet our legal and tax obligations, including retaining records of the HST we charge.",
    ],
  },
  {
    h: "4. Who we share it with",
    p: [
      "We do not sell your personal information, and we do not share it for advertising.",
      "We use a small number of processors to run the service, each receiving only what their job needs:",
    ],
    li: [
      "Supabase — our database and document storage (hosted infrastructure).",
      "Stripe — payment processing and refunds. Stripe is the card processor; their own privacy terms apply to your card data.",
      "Mapbox — address search and route/distance calculation. Addresses you type are sent to Mapbox to be resolved.",
      "Google — only if you choose to sign in with Google.",
      "Our email provider — to deliver booking emails to you.",
      "Your assigned chauffeur — who receives the details needed to complete your ride: pickup and drop-off, time, passenger name and phone.",
      "Law enforcement or regulators, where we are legally required to disclose.",
    ],
  },
  {
    h: "5. How long we keep it",
    p: [
      "Booking and payment records are kept for as long as required for tax and accounting purposes, and to resolve disputes.",
      "Chauffeur application documents are kept for as long as you drive with us, and for a reasonable period afterwards to evidence that we verified you. Declined applications are kept only as long as needed to explain the decision.",
      "You can ask us to delete your account; we will do so except where we are required to retain records.",
    ],
  },
  {
    h: "6. Your rights",
    p: [
      "Under Canadian privacy law (PIPEDA) you can ask us for a copy of the personal information we hold about you, ask us to correct it if it's wrong, ask us to delete it, or withdraw a consent you previously gave.",
      `Email ${SITE.email} and we will respond within 30 days. If you're not satisfied with our answer, you can complain to the Office of the Privacy Commissioner of Canada.`,
    ],
  },
  {
    h: "7. Security",
    p: [
      "Access to your data is restricted by role: you can see your own bookings, a chauffeur sees only rides assigned to them, and administrative access is limited to dispatch staff. Chauffeur documents are stored privately and are not publicly reachable.",
      "No system is perfectly secure. If a breach affects you, we will notify you and the regulator as the law requires.",
    ],
  },
  {
    h: "8. Cross-border processing",
    p: [
      "Some of our processors store or handle data outside Canada, including in the United States. Where that happens, your information may be subject to the laws of that country, including lawful access by its authorities.",
    ],
  },
  {
    h: "9. Changes",
    p: [
      "If we change this policy materially we will update the date above and, where the change affects you meaningfully, tell you directly.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      accent="Policy."
      updated="Last updated 16 July 2026"
      intro="This explains what personal information we collect, why we collect it, who we share it with, and what you can ask us to do with it."
      sections={SECTIONS}
    />
  );
}
