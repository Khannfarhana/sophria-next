import type { Metadata } from "next";
import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Plane, Briefcase, Heart, Compass, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Chauffeur Services",
  description: "Airport transfers, corporate travel, weddings, city tours and hourly charter. Toronto chauffeur service.",
  openGraph: {
    title: "SophRia Services",
    description: "Airport, corporate, weddings, tours, hourly.",
  },
};

const SERVICES = [
  { Icon: Plane, title: "Airport Transfers", body: "Flat-rate transfers to and from Pearson (YYZ) and Billy Bishop (YTZ). Live flight tracking included.", from: 85 },
  { Icon: Briefcase, title: "Corporate Travel", body: "Discreet point-to-point service for board meetings, client visits, and roadshows.", from: 95 },
  { Icon: Heart, title: "Wedding & Events", body: "Multi-vehicle coordination, day-of timing, and the right car for the moment.", from: 220 },
  { Icon: Compass, title: "City Tours", body: "Bespoke tours of Toronto — Distillery District, Niagara, Prince Edward County and beyond.", from: 120 },
  { Icon: Clock, title: "Hourly Charter", body: "Reserve a chauffeur and vehicle for the hour. Ideal for events with multiple stops.", from: 95 },
];

export default function ServicesPage() {
  return (
    <SiteLayout>
      <section className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-5xl">
          <div className="eyebrow mb-6">Services</div>
          <h1 className="text-5xl md:text-6xl font-light">For every kind of arrival.</h1>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ Icon, title, body, from }) => (
              <div key={title} className="flex flex-col bg-background p-10 border border-border">
                <Icon className="h-6 w-6 text-foreground" />
                <h3 className="mt-8 text-2xl font-light">{title}</h3>
                <p className="mt-3 flex-1 text-sm text-ink-muted leading-relaxed">{body}</p>
                <div className="mt-8 flex items-end justify-between border-t border-border pt-4">
                  <div>
                    <div className="text-xs text-ink-soft">from</div>
                    <div className="text-lg">${from} <span className="text-xs text-ink-soft">CAD</span></div>
                  </div>
                  <Link href="/book" className="text-sm text-foreground hover:text-ink-muted font-medium cursor-pointer">
                    Reserve →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
