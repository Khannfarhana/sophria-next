import type { Metadata } from "next";
import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Plane, Briefcase, Heart, Clock, ArrowRight, ShoppingBag, Flower2, Wine, GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Chauffeur Services",
  description: "Airport transfers, corporate travel, wedding and prom packages, shopping, spa and wine tours. Luxury chauffeur service across Toronto and Southern Ontario.",
  openGraph: {
    title: "SophRia Services",
    description: "Airport, corporate, weddings, proms, shopping, spa and wine tours.",
  },
};

const SERVICES = [
  { Icon: Plane, title: "Airport Transfers", body: "Transfers to and from Pearson (YYZ), Billy Bishop (YTZ), Hamilton (YHM) and Buffalo Niagara (BUF). Live flight tracking included.", from: "$110" },
  { Icon: Briefcase, title: "Corporate Transportation", body: "Executive meetings, conferences, corporate events and client transportation. Corporate accounts and monthly billing available upon approval.", from: "$95" },
  { Icon: Heart, title: "Wedding Packages", body: "Professional chauffeur, optional decorative ribbons, red carpet on request and multiple photo stops. Custom packages available.", from: "$695" },
  { Icon: GraduationCap, title: "Prom Packages", body: "Safety-focused transportation with a professional chauffeur and complimentary bottled water. Group pricing available.", from: "$595" },
  { Icon: ShoppingBag, title: "Luxury Shopping", body: "Private chauffeur to Yorkdale, Eaton Centre, Square One, Sherway Gardens and Vaughan Mills — flexible waiting while you shop. 3-hour minimum.", from: "$95/hr" },
  { Icon: Flower2, title: "Daily Spa Tours", body: "Quiet luxury travel to Elmwood, Body Blitz, Thermëa Whitby, Ste. Anne's and more — waiting time during your visit included. 4-hour minimum.", from: "$120/hr" },
  { Icon: Wine, title: "Wine & Niagara Tours", body: "Chauffeured wine-country and Niagara itineraries, customized to your day. 6-hour minimum.", from: "$125/hr" },
  { Icon: Clock, title: "Hourly Charter", body: "Reserve a chauffeur and vehicle for the hour. Ideal for events with multiple stops. 2-hour minimum.", from: "$85/hr" },
];

export default function ServicesPage() {
  return (
    <SiteLayout>
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-20 pt-36 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">Services</div>
          <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">
            For every kind of <span className="text-[#e7d3a8]">arrival.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70">
            From airport runs to weddings — one standard of service across Toronto, Hamilton,
            Burlington, Oakville, Mississauga, the Niagara Region and Southern Ontario.
          </p>
        </div>
      </section>

      {/* Service cards */}
      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ Icon, title, body, from }) => (
              <div
                key={title}
                className="group flex flex-col rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface transition-colors group-hover:border-foreground">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="mt-6 text-xl font-light text-foreground">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{body}</p>
                <div className="mt-6 flex items-end justify-between border-t border-border pt-5">
                  <div>
                    <div className="text-[10px] text-ink-soft">from</div>
                    <div className="text-lg text-foreground">{from} <span className="text-xs text-ink-soft">CAD</span></div>
                  </div>
                  <Link
                    href="/book"
                    className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-[#2A2A2A]"
                  >
                    Reserve <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="bg-surface px-6 py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <p className="text-xl font-light text-foreground">Not sure which service fits?</p>
            <p className="mt-1 text-sm text-ink-muted">Our team is available 24/7 to help you choose.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/contact" className="rounded-sm border border-border px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-background">
              Get in Touch
            </Link>
            <Link href="/book" className="rounded-sm bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]">
              Book Now
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
