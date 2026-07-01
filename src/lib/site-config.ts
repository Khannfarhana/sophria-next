/**
 * Central site configuration — contact details, hours, service positioning.
 * NOTE: contact values below are PLACEHOLDERS. Swap with real SophRia details.
 */
export const SITE = {
  name: "SophRia",
  tagline: "Toronto's premier chauffeur service.",
  // --- Contact (placeholders) ---
  phone: "+1 (416) 555-0188",
  phoneHref: "tel:+14165550188",
  phoneAlt: "+1 (647) 555-0042",
  phoneAltHref: "tel:+16475550042",
  email: "concierge@sophria.example",
  emailHref: "mailto:concierge@sophria.example",
  whatsapp: "+1 (416) 555-0188",
  address: {
    line1: "100 Front Street West",
    line2: "Toronto, ON M5J 1E3",
    full: "100 Front Street West, Toronto, ON M5J 1E3",
  },
  hours: "24/7 — round-the-clock dispatch",
  // --- Positioning ---
  region: "Greater Toronto Area",
  established: 2018,
} as const;
