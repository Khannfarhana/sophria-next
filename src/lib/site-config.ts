/**
 * Central site configuration — contact details, hours, service positioning.
 */
export const SITE = {
  name: "SophRia",
  tagline: "Luxury limousine & chauffeur services.",
  // --- Contact ---
  phone: "+1 (437) 967-2334",
  phoneHref: "tel:+14379672334",
  email: "hello@sophria.com",
  emailHref: "mailto:hello@sophria.com",
  whatsapp: "+1 (437) 967-2334",
  address: {
    line1: "100 Front Street West",
    line2: "Toronto, ON M5J 1E3",
    full: "100 Front Street West, Toronto, ON M5J 1E3",
  },
  hours: "24/7 — round-the-clock dispatch",
  // --- Positioning ---
  region: "Toronto, Hamilton, Burlington, Oakville, Mississauga, Niagara Region & Southern Ontario",
  established: 2018,
} as const;
