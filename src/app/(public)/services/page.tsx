import type { Metadata } from "next";
import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";
import { ArrowRight } from "lucide-react";
import airportImg from "@/assets/services/airport.jpg";
import corporateImg from "@/assets/services/corporate.jpg";
import weddingImg from "@/assets/services/wedding.jpg";
import promImg from "@/assets/services/prom.jpg";
import shoppingImg from "@/assets/services/shopping.jpg";
import spaImg from "@/assets/services/spa.jpg";
import wineImg from "@/assets/services/wine.jpg";
import hourlyImg from "@/assets/services/hourly.jpg";

export const metadata: Metadata = {
  title: "Chauffeur Services",
  description: "Airport transfers, corporate travel, wedding and prom packages, shopping, spa and wine tours. Luxury chauffeur service across Toronto and Southern Ontario.",
  openGraph: {
    title: "SophRia Services",
    description: "Airport, corporate, weddings, proms, shopping, spa and wine tours.",
  },
};

const SERVICES: {
  img: StaticImageData;
  title: string;
  body: string;
  from: string;
}[] = [
  { img: airportImg, title: "Airport Transfers", body: "Transfers to and from Pearson (YYZ), Billy Bishop (YTZ), Hamilton (YHM) and Buffalo Niagara (BUF). Live flight tracking included.", from: "$110" },
  { img: corporateImg, title: "Corporate Transportation", body: "Executive meetings, conferences, corporate events and client transportation. Corporate accounts and monthly billing available upon approval.", from: "$95" },
  { img: weddingImg, title: "Wedding Packages", body: "Professional chauffeur, optional decorative ribbons, red carpet on request and multiple photo stops. Custom packages available.", from: "$695" },
  { img: promImg, title: "Prom Packages", body: "Safety-focused transportation with a professional chauffeur and complimentary bottled water. Group pricing available.", from: "$595" },
  { img: shoppingImg, title: "Luxury Shopping", body: "Private chauffeur to Yorkdale, Eaton Centre, Square One, Sherway Gardens and Vaughan Mills — flexible waiting while you shop. 3-hour minimum.", from: "$95/hr" },
  { img: spaImg, title: "Daily Spa Tours", body: "Quiet luxury travel to Elmwood, Body Blitz, Thermëa Whitby, Ste. Anne's and more — waiting time during your visit included. 4-hour minimum.", from: "$120/hr" },
  { img: wineImg, title: "Wine & Niagara Tours", body: "Chauffeured wine-country and Niagara itineraries, customized to your day. 6-hour minimum.", from: "$125/hr" },
  { img: hourlyImg, title: "Hourly Charter", body: "Reserve a chauffeur and vehicle for the hour. Ideal for events with multiple stops. 2-hour minimum.", from: "$85/hr" },
];

export default function ServicesPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Services"
        title={<>For every kind of <span className="text-gold-soft">arrival.</span></>}
        sub="From airport runs to weddings — one standard of service across Toronto, Hamilton, Burlington, Oakville, Mississauga, the Niagara Region and Southern Ontario."
      />

      {/* Photo cards */}
      <section className="bg-night px-6 pb-20 text-white md:pb-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ img, title, body, from }) => (
              <div
                key={title}
                className="group flex flex-col overflow-hidden rounded-sm bg-night-card"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={img}
                    alt={title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-700 ease-out group-hover:scale-105"
                  />
                  {/* Blend the photo into the card body */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-night-card"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6 pt-2">
                  <h3 className="font-display text-2xl">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-white/65">{body}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gold-soft">
                      from <span className="text-white">{from}</span>{" "}
                      <span className="text-white/50">CAD</span>
                    </div>
                    <Link
                      href="/book"
                      className="group/cta inline-flex items-center gap-1.5 text-sm text-white transition-colors hover:text-gold-soft"
                    >
                      Reserve
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/cta:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="bg-night-panel px-6 py-16 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <p className="font-display text-2xl">Not sure which service fits?</p>
            <p className="mt-1 text-sm text-white/60">Our team is available 24/7 to help you choose.</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/contact"
              className="rounded-full border border-white/25 px-6 py-2.5 text-sm font-medium text-white transition hover:border-gold hover:text-gold-soft"
            >
              Get in Touch
            </Link>
            <Link
              href="/book"
              className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-gold-soft"
            >
              Book Now
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
