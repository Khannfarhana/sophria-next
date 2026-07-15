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
      { q: "Can I book multiple stops?", a: "Yes — multi-stop trips are supported on hourly charter bookings. Additional stops on point-to-point trips may incur extra charges." },
      { q: "Where do you operate?", a: "We serve Toronto, Hamilton, Burlington, Oakville, Mississauga, the Niagara Region and Southern Ontario." },
      { q: "Which airports do you serve?", a: "Toronto Pearson (YYZ), Billy Bishop (YTZ), John C. Munro Hamilton (YHM) and Buffalo Niagara (BUF). Airport transfers start at $110 depending on pickup and destination. Pearson trips are priced by the official Toronto Pearson airport tariff (taxes included), scaled by vehicle class." },
    ],
  },
  {
    title: "Payment",
    items: [
      { q: "Which payment methods do you accept?", a: "All major credit and debit cards in CAD via Stripe. Corporate accounts with monthly billing are available upon approval." },
      { q: "When am I charged?", a: "Once dispatch confirms your booking, you'll receive a secure payment link — the full fare is paid online to secure your booking before a chauffeur is assigned." },
      { q: "What extra charges can apply?", a: "HST (13%) applies to all services and is shown as its own line on your quote. Airport pickups and drop-offs carry a $17.25 airport fee. Highway tolls (including Highway 407) and parking are additional where applicable, and waiting time beyond the complimentary period is billed at the applicable hourly rate." },
      { q: "Is gratuity included?", a: "No — gratuity is separate and entirely yours to choose. At payment you can add a tip, with 15% suggested; 100% of it goes directly to your chauffeur." },
    ],
  },
  {
    title: "Cancellation",
    items: [
      { q: "What is your cancellation policy?", a: "Cancel more than 12 hours before pickup and there's no charge — you're refunded in full. Inside that window a cancellation fee applies: 25% within 12 hours of pickup, 50% within 6 hours, 75% within 15 minutes, and 100% at or after the pickup time. The fee is calculated on the fare and its HST; any tip is always refunded in full. Weddings, proms and other special-event bookings have separate terms — see our Refund & Cancellation Policy, or contact dispatch." },
      { q: "How do refunds work?", a: "Refunds are issued automatically to your original payment method as soon as you cancel, less any cancellation fee. They typically appear within 5–10 business days, depending on your bank." },
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
      { q: "What vehicles are available?", a: "Executive sedans, business class sedans, luxury SUVs, stretch limousines and executive sprinters. See the Fleet page for details." },
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
