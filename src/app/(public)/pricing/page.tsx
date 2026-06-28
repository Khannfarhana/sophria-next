import type { Metadata } from "next";
import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ArrowRight } from "lucide-react";

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
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-20 pt-36 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">Pricing</div>
          <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">
            No surge. <span className="text-[#e7d3a8]">No surprises.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70">
            All rates in Canadian Dollars. Gratuity not included. Tolls, parking and waiting time billed at cost.
          </p>
        </div>
      </section>

      {/* Pricing table */}
      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface text-left">
                <tr>
                  <th className="px-6 py-4 text-xs uppercase tracking-wider text-ink-muted">Vehicle</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wider text-ink-muted">Hourly</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wider text-ink-muted">YYZ / YTZ Flat</th>
                </tr>
              </thead>
              <tbody>
                {FLEET_RATES.map((r, i) => (
                  <tr
                    key={r.name}
                    className={`transition-colors hover:bg-surface ${i < FLEET_RATES.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <td className="px-6 py-4 font-light text-foreground">{r.name}</td>
                    <td className="px-6 py-4 text-foreground">${r.hr} <span className="text-xs text-ink-soft">/hr</span></td>
                    <td className="px-6 py-4 text-foreground">${r.airport}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="bg-surface px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-8">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-muted">Airport Flat Rates</div>
              <p className="text-sm leading-relaxed text-ink-muted">
                Pearson (YYZ) and Billy Bishop (YTZ) transfers from downtown Toronto are billed at the flat rate above. Other GTA pickups are zone-based — confirmed at booking.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-8">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-muted">Dynamic Adjustments</div>
              <p className="text-sm leading-relaxed text-ink-muted">
                During major events (TIFF, Caribana, NYE), evening rates may apply. We will always quote the final fare before confirming. We do not use surge pricing.
              </p>
            </div>
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3.5 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]"
            >
              Reserve a Vehicle <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
