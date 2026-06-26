import type { Metadata } from "next";
import { SiteLayout } from "@/components/site/SiteLayout";

export const metadata: Metadata = {
  title: "About",
  description: "SophRia is Toronto's discreet luxury chauffeur service. Learn about our story, values, and team.",
  openGraph: {
    title: "About SophRia",
    description: "Toronto's discreet luxury chauffeur service.",
  },
};

export default function AboutPage() {
  return (
    <SiteLayout>
      <section className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <div className="eyebrow mb-6">About</div>
          <h1 className="text-5xl md:text-6xl font-light">A standard, quietly held.</h1>
          <p className="mt-8 max-w-2xl text-lg text-ink-muted">
            SophRia was founded in 2018 on a simple idea: that arriving somewhere should feel as considered as the destination itself.
          </p>
        </div>
      </section>

      <section className="bg-surface px-6 py-24">
        <div className="mx-auto grid max-w-5xl gap-16 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-3">Mission</div>
            <p className="text-lg leading-relaxed text-ink-muted">To deliver private ground transportation that feels effortless — for the people who notice the difference.</p>
          </div>
          <div>
            <div className="eyebrow mb-3">Promise</div>
            <p className="text-lg leading-relaxed text-ink-muted">Discretion, punctuality, and a vehicle that arrives as advertised. Every reservation, every time.</p>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="eyebrow mb-4">Values</div>
          <h2 className="mb-12 text-3xl md:text-4xl">Three principles.</h2>
          <div className="grid gap-px bg-border md:grid-cols-3">
            {[
              { t: "Discretion", b: "What happens in the cabin remains in the cabin. Always." },
              { t: "Precision", b: "Routes planned, traffic monitored, timings rehearsed." },
              { t: "Composure", b: "Calm professionalism — without exception, without performance." },
            ].map((v) => (
              <div key={v.t} className="bg-background p-10">
                <h3 className="text-xl">{v.t}</h3>
                <p className="mt-3 text-sm text-ink-muted">{v.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="eyebrow mb-4">Team</div>
          <h2 className="mb-12 text-3xl md:text-4xl">The people behind the service.</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { n: "Sophia Reyes", r: "Founder & CEO" },
              { n: "Marcus Chen", r: "Head of Operations" },
              { n: "Priya Anand", r: "Client Experience" },
            ].map((m) => (
              <div key={m.n} className="rounded-sm border border-border bg-card p-8">
                <div className="mb-6 aspect-square w-16 rounded-full bg-background" />
                <div className="text-lg">{m.n}</div>
                <div className="text-sm text-ink-muted">{m.r}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
