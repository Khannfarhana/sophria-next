import type { Metadata } from "next";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = {
  title: "About",
  description: "SophRia is a discreet luxury chauffeur service for Toronto and Southern Ontario. Learn about our story, values, and team.",
  openGraph: {
    title: "About SophRia",
    description: "Discreet luxury chauffeur service across Toronto and Southern Ontario.",
  },
};

export default function AboutPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="About"
        title={<>A standard, <span className="text-gold-soft">quietly held.</span></>}
        sub="SophRia was founded in 2018 on a simple idea: that arriving somewhere should feel as considered as the destination itself."
      />

      {/* Mission + Promise */}
      <section className="bg-night px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-sm bg-night-card p-10">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/70">Mission</div>
              <p className="font-display text-xl leading-relaxed text-white">
                To deliver private ground transportation that feels effortless — for the people who notice the difference.
              </p>
            </div>
            <div className="rounded-sm bg-night-card p-10">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/70">Promise</div>
              <p className="font-display text-xl leading-relaxed text-white">
                Discretion, punctuality, and a vehicle that arrives as advertised. Every reservation, every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-night-panel px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/70"><span className="h-px w-8 bg-gold" aria-hidden />Values</div>
          <h2 className="mb-10 text-3xl font-light md:text-4xl">Three principles.</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { t: "Discretion", b: "What happens in the cabin remains in the cabin. Always." },
              { t: "Precision", b: "Routes planned, traffic monitored, timings rehearsed." },
              { t: "Composure", b: "Calm professionalism — without exception, without performance." },
            ].map((v) => (
              <div key={v.t} className="rounded-sm bg-night-card p-8">
                <h3 className="font-display text-2xl text-white">{v.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{v.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-night px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/70"><span className="h-px w-8 bg-gold" aria-hidden />Team</div>
          <h2 className="mb-10 text-3xl font-light md:text-4xl">The people behind the service.</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "Sophia Reyes", r: "Founder & CEO" },
              { n: "Marcus Chen", r: "Head of Operations" },
              { n: "Priya Anand", r: "Client Experience" },
            ].map((m) => (
              <div key={m.n} className="flex items-center gap-5 rounded-sm bg-night-card p-6">
                <div
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-lg text-gold-soft"
                >
                  {m.n.split(" ").map((part) => part[0]).join("")}
                </div>
                <div>
                  <div className="text-base font-medium text-white">{m.n}</div>
                  <div className="text-sm text-white/60">{m.r}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
