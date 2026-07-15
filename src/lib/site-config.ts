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
  phone: "437-967-2334",
  phoneHref: "tel:+14379672334",
  email: "hello@sophria.ca",
  emailHref: "mailto:hello@sophria.ca",
  whatsapp: "437-967-2334",
  whatsappHref: "https://wa.me/14379672334",
  /**
   * ⚠ CONFIRM WITH THE CLIENT. Three addresses are in play:
   *   - 6030 Bathurst St, Unit 104, North York M2R 1Z9 — set here on 11 Jul
   *     ("updated address and phone no").
   *   - 1 de Boers Drive, Unit 716, North York M3J 0G6 — what the client sent
   *     on 13 Jul AND again on 14 Jul, i.e. after that commit. Used below,
   *     because it is the most recent instruction we have.
   *   - Scarborough — mentioned on 15 Jul as the address given to Stripe for
   *     business verification.
   * Whichever is the real registered address should also match Stripe, or
   * verification and the receipts will disagree.
   */
  address: {
    line1: "1 de Boers Drive, Unit 716",
    line2: "North York, ON M3J 0G6",
    city: "Toronto",
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
