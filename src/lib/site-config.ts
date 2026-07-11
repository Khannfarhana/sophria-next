/**
 * Central site configuration — contact details, hours, service positioning.
 */
export const SITE = {
  name: "SophRia",
  tagline: "Luxury limousine & chauffeur services.",
  // --- Contact ---
  phone: "437-967-2334",
  phoneHref: "tel:+14379672334",
  email: "hello@sophria.com",
  emailHref: "mailto:hello@sophria.com",
  whatsapp: "437-967-2334",
  address: {
    line1: "6030 Bathurst St, Unit 104",
    line2: "North York, ON M2R 1Z9",
    city: "Toronto",
    full: "6030 Bathurst St, Unit 104, North York, ON M2R 1Z9, Toronto",
  },
  hours: "24/7 — round-the-clock dispatch",
  // --- Positioning ---
  region: "Toronto, Hamilton, Burlington, Oakville, Mississauga, Niagara Region & Southern Ontario",
  established: 2018,
} as const;
