import type { Metadata } from "next";
import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";
import { ArrowRight, Plane } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent chauffeur rates for Toronto, Hamilton, Niagara and Southern Ontario. Hourly service, airport transfers, wedding, prom, shopping, spa and wine tour packages.",
  openGraph: {
    title: "SophRia Pricing",
    description: "Transparent CAD rates for luxury limousine & chauffeur services.",
  },
};

// Marketing rates — kept consistent with the fare engine: hourly = the
// vehicle's hourly_rate; airport "from" = base_rate + $15 airport fee
// (see src/lib/pricing.ts and the vehicles table).
// Order mirrors vehicles.sort_order (20260716160000), NOT price: SUV leads
// everywhere, because "executive clients don't like to search, what comes
// first that's it". This list is hand-maintained — /fleet, /book and the admin
// read sort_order from the DB, but this page is static marketing copy.
const FLEET_RATES = [
  { name: "Luxury SUV", hr: 120, airport: 145 },
  { name: "Executive Sedan", hr: 85, airport: 110 },
  { name: "Business Class", hr: 95, airport: 145 },
  { name: "Executive Sprinter", hr: 220, airport: 335 },
  { name: "Stretch Limousine", hr: 180, airport: 275 },
];

const PACKAGES = [
  {
    title: "Wedding Packages",
    price: "from $695",
    detail: "Professional chauffeur · decorative ribbons (optional) · complimentary bottled water · red carpet service (upon request) · multiple photo stops. Custom packages available.",
  },
  {
    title: "Prom Packages",
    price: "from $595",
    detail: "Professional chauffeur · complimentary bottled water · safety-focused transportation · group pricing available.",
  },
  {
    title: "Luxury Shopping Package",
    price: "from $95/hr · 3-hour minimum",
    detail: "Private chauffeur-driven shopping at Yorkdale, CF Toronto Eaton Centre, Square One, Sherway Gardens and Vaughan Mills. Flexible waiting time, assistance with bags, door-to-door service.",
  },
  {
    title: "Daily Spa Tours",
    price: "from $120/hr · 4-hour minimum",
    detail: "Relaxed luxury travel to Elmwood Spa, Body Blitz, Spa My Blend (Ritz-Carlton), Thermëa Whitby, Ste. Anne's Grafton and White Oaks Niagara-on-the-Lake. Waiting time during your visit included.",
  },
  {
    title: "Wine & Niagara Tours",
    price: "from $125/hr · 6-hour minimum",
    detail: "Chauffeured wine-country and Niagara itineraries, customized to your day.",
  },
];

const ADDITIONAL_CHARGES = [
  "HST (13%) applies to all services.",
  "Gratuity may be added for larger groups or special events.",
  "Highway tolls (including Highway 407), parking fees and airport fees are additional where applicable.",
  "Waiting time beyond the complimentary period is billed at the applicable hourly rate.",
  "Additional stops may incur extra charges.",
  "Excessive cleaning or damage to the vehicle may result in additional fees.",
];

export default function PricingPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Pricing"
        title={<>No surge. <span className="text-gold-soft">No surprises.</span></>}
        sub="Luxury limousine &amp; chauffeur services across Toronto, Hamilton, Burlington, Oakville, Mississauga, the Niagara Region and Southern Ontario. All rates in Canadian Dollars."
      />

      {/* Pricing table */}
      <section className="bg-night px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="overflow-hidden rounded-sm bg-night-card">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-white/5 text-left">
                <tr>
                  <th className="px-6 py-4 text-xs uppercase tracking-wider text-white/60">Vehicle</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wider text-white/60">Hourly from</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wider text-white/60">Airport from</th>
                </tr>
              </thead>
              <tbody>
                {FLEET_RATES.map((r, i) => (
                  <tr
                    key={r.name}
                    className={`transition-colors hover:bg-white/5 ${i < FLEET_RATES.length - 1 ? "border-b border-white/10" : ""}`}
                  >
                    <td className="px-6 py-4 font-light text-white">{r.name}</td>
                    <td className="px-6 py-4 text-white">${r.hr} <span className="text-xs text-gold-soft">/hr</span></td>
                    <td className="px-6 py-4 text-white">${r.airport}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-white/50">
            Hourly service has a 2-hour minimum booking. Airport transfer pricing starts at $110 and
            depends on pickup and destination.
          </p>
        </div>
      </section>

      {/* Packages */}
      <section className="bg-night-panel px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/70"><span className="h-px w-8 bg-gold" aria-hidden />Signature Packages</div>
            <h2 className="text-3xl font-light md:text-4xl">Occasions, taken care of.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {PACKAGES.map((p) => (
              <div key={p.title} className="rounded-sm bg-night-card p-8">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-light text-white">{p.title}</h3>
                </div>
                <div className="mt-1 text-sm font-medium text-gold-soft">{p.price}</div>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{p.detail}</p>
              </div>
            ))}
            <div className="rounded-sm bg-night-card p-8">
              <h3 className="text-lg font-light text-white">Corporate Transportation</h3>
              <div className="mt-1 text-sm font-medium text-gold-soft">accounts available</div>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Airport transfers, executive meetings, conferences, corporate events and client
                transportation. Corporate accounts and monthly billing are available upon approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Airports + adjustments */}
      <section className="bg-night px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="rounded-sm bg-night-card p-8">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/70">
                <Plane className="h-3.5 w-3.5" /> Airports We Serve
              </div>
              <ul className="space-y-2 text-sm leading-relaxed text-white/70">
                <li>Toronto Pearson International (YYZ)</li>
                <li>Billy Bishop Toronto City (YTZ)</li>
                <li>John C. Munro Hamilton International (YHM)</li>
                <li>Buffalo Niagara International (BUF)</li>
              </ul>
              <p className="mt-3 text-xs text-white/50">Transfers start at $110, depending on pickup and destination. Live flight tracking when flight details are provided.</p>
              <p className="mt-2 text-xs text-white/50">
                Pearson transfers are priced by the official Toronto Pearson airport tariff (taxes included), scaled by vehicle class. Requested stops $10 per 10 minutes; more than 4 passengers or excess baggage +$15 once per trip; Highway 407 tolls passed through at cost.
              </p>
            </div>
            <div className="rounded-sm bg-night-card p-8">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/70">Dynamic Adjustments</div>
              <p className="text-sm leading-relaxed text-white/70">
                During major events (TIFF, Caribana, NYE), evening rates may apply. We will always quote the final fare before confirming. We do not use surge pricing.
              </p>
            </div>
          </div>

          {/* Additional charges */}
          <div className="mt-10 rounded-sm bg-night-card p-8">
            <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/70">Additional Charges</div>
            <ul className="grid gap-2 text-sm leading-relaxed text-white/70 md:grid-cols-2">
              {ADDITIONAL_CHARGES.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/book"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-medium text-black transition hover:bg-gold-soft"
            >
              Reserve a Vehicle <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
