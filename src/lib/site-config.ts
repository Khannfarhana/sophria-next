/**
 * Central site configuration — contact details, hours, service positioning.
 *
 * This is now genuinely central. It used to claim to be the "single source" in
 * its docstring while nothing imported it: every phone number, email and region
 * string was hardcoded at each call site, and this file still held a
 * placeholder address the site had never shown. Editing it changed nothing,
 * which made it worse than not existing. Contact values are consumed from here
 * by the navbar, footer, contact page, WhatsApp button and mailer templates —
 * change them once, here.
 */
export const SITE = {
  /** Short mark, for tight spaces. */
  name: "SophRia",
  /** How the client wants the business named in full (14 Jul, asked three times). */
  fullName: "SophRia Limousine Services",
  /** Registered entity the Stripe account is being verified under. */
  legalName: "Sophria Private Limited Inc.",
  tagline: "Luxury limousine & chauffeur services.",

  // --- Contact ---
  phone: "+1 (437) 967-2334",
  phoneHref: "tel:+14379672334",
  email: "hello@sophria.ca",
  emailHref: "mailto:hello@sophria.ca",
  whatsapp: "+1 (437) 967-2334",
  whatsappHref: "https://wa.me/14379672334",
  address: {
    line1: "1 de Boers Drive, Unit 716",
    line2: "North York, ON M3J 0G6",
    country: "Canada",
    full: "1 de Boers Drive, Unit 716, North York, ON M3J 0G6, Canada",
  },
  hours: "24/7 — round-the-clock dispatch",

  // --- Positioning ---
  /** Short line, as the client phrases it (13 & 14 Jul). */
  serviceArea: "Greater Toronto Area and across the border",
  /** Long form, kept for SEO and the pages that enumerate coverage. */
  region: "Toronto, Hamilton, Burlington, Oakville, Mississauga, Niagara Region & Southern Ontario",
  established: 2018,
} as const;
