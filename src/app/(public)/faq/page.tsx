import type { Metadata } from "next";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about booking, payment, cancellation, drivers, and the SophRia fleet.",
  openGraph: {
    title: "SophRia FAQ",
    description: "Frequently asked questions.",
  },
};

const SECTIONS = [
  {
    title: "Booking",
    items: [
      { q: "How far in advance should I book?", a: "We recommend 24 hours for guaranteed availability. Same-day bookings are accepted subject to fleet availability." },
      { q: "Can I book multiple stops?", a: "Yes — multi-stop trips are supported on hourly charter bookings." },
    ],
  },
  {
    title: "Payment",
    items: [
      { q: "Which payment methods do you accept?", a: "All major credit and debit cards in CAD via Stripe. Corporate invoicing available on request." },
      { q: "When am I charged?", a: "Your card is authorized at booking and charged after the trip is completed." },
    ],
  },
  {
    title: "Cancellation",
    items: [
      { q: "What is your cancellation policy?", a: "Free cancellation up to 4 hours before pickup for standard bookings. Events and wedding bookings have separate terms." },
    ],
  },
  {
    title: "Drivers",
    items: [
      { q: "Are your drivers vetted?", a: "Every chauffeur is licensed, insured, background-checked, and trained on our service standards." },
      { q: "Will I have the same driver each time?", a: "Repeat clients can request a preferred chauffeur — we accommodate where possible." },
    ],
  },
  {
    title: "Fleet",
    items: [
      { q: "What vehicles are available?", a: "Luxury sedans, business class sedans, SUVs, stretch limousines and party buses. See the Fleet page for details." },
      { q: "Are child seats available?", a: "Yes — please note your requirements in the booking notes." },
    ],
  },
];

export default function FAQPage() {
  return (
    <SiteLayout>
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-20 pt-36 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">FAQ</div>
          <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">
            Quietly <span className="text-[#e7d3a8]">comprehensive.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70">
            Answers about booking, payment, cancellation, drivers, and the SophRia fleet.
          </p>
        </div>
      </section>

      <section className="bg-background px-6 pb-32 pt-20">
        <div className="mx-auto max-w-3xl space-y-12">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <h2 className="mb-4 text-2xl font-light text-foreground">{sec.title}</h2>
              <Accordion type="single" collapsible className="border-t border-border">
                {sec.items.map((it, i) => (
                  <AccordionItem key={i} value={`${sec.title}-${i}`} className="border-b border-border">
                    <AccordionTrigger className="py-5 text-left text-base hover:no-underline font-light text-foreground">{it.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-ink-muted leading-relaxed">{it.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </section>
    </SiteLayout>
  );
}
