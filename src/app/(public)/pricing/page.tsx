import type { Metadata } from "next";
import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Transparent rates for Toronto chauffeur service. Flat airport rates, hourly charter, vehicle-by-vehicle pricing.",
  openGraph: {
    title: "SophRia Pricing",
    description: "Transparent CAD rates for chauffeur service.",
  },
};

const FLEET_RATES = [
  { name: "Luxury Sedan", hr: 95, airport: 85 },
  { name: "Business Class", hr: 120, airport: 110 },
  { name: "Luxury SUV", hr: 160, airport: 140 },
  { name: "Stretch Limousine", hr: 250, airport: 220 },
  { name: "Party Bus", hr: 380, airport: 320 },
];

export default function PricingPage() {
  return (
    <SiteLayout>
      <section className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-5xl">
          <div className="eyebrow mb-6">Pricing</div>
          <h1 className="text-5xl md:text-6xl font-light">No surge. No surprises.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-muted">All rates in Canadian Dollars (CAD). Gratuity not included. Tolls, parking and waiting time billed at cost.</p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-sm border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="p-5">Vehicle</th>
                <th className="p-5">Hourly</th>
                <th className="p-5">YYZ / YTZ Flat</th>
              </tr>
            </thead>
            <tbody>
              {FLEET_RATES.map((r, i) => (
                <tr key={r.name} className={i < FLEET_RATES.length - 1 ? "border-b border-border" : ""}>
                  <td className="p-5">{r.name}</td>
                  <td className="p-5">${r.hr} <span className="text-xs text-ink-soft">/hr</span></td>
                  <td className="p-5">${r.airport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-surface px-6 py-24">
        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-3">Airport Flat Rates</div>
            <p className="text-base leading-relaxed text-ink-muted">Pearson (YYZ) and Billy Bishop (YTZ) transfers from downtown Toronto are billed at the flat rate above. Other GTA pickups are zone-based — confirmed at booking.</p>
          </div>
          <div>
            <div className="eyebrow mb-3">Dynamic Adjustments</div>
            <p className="text-base leading-relaxed text-ink-muted">During major events (TIFF, Caribana, NYE), evening rates may apply. We will always quote the final fare before confirming your reservation. We do not use surge pricing.</p>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-5xl text-center">
          <Link href="/book" className="inline-flex rounded-sm bg-primary px-8 py-4 text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] cursor-pointer">
            Reserve a vehicle
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}
