import type { Metadata } from "next";
import { SiteLayout } from "@/components/site/SiteLayout";

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
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-20 pt-36 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">About</div>
          <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">
            A standard, <span className="text-[#e7d3a8]">quietly held.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70">
            SophRia was founded in 2018 on a simple idea: that arriving somewhere should feel as considered as the destination itself.
          </p>
        </div>
      </section>

      {/* Mission + Promise */}
      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-10">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-muted">Mission</div>
              <p className="text-lg font-light leading-relaxed text-foreground">
                To deliver private ground transportation that feels effortless — for the people who notice the difference.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-10">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-muted">Promise</div>
              <p className="text-lg font-light leading-relaxed text-foreground">
                Discretion, punctuality, and a vehicle that arrives as advertised. Every reservation, every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-surface px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-muted">Values</div>
          <h2 className="mb-10 text-3xl font-light md:text-4xl">Three principles.</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { t: "Discretion", b: "What happens in the cabin remains in the cabin. Always." },
              { t: "Precision", b: "Routes planned, traffic monitored, timings rehearsed." },
              { t: "Composure", b: "Calm professionalism — without exception, without performance." },
            ].map((v) => (
              <div key={v.t} className="rounded-2xl border border-border bg-card p-8">
                <h3 className="text-xl font-light text-foreground">{v.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{v.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-muted">Team</div>
          <h2 className="mb-10 text-3xl font-light md:text-4xl">The people behind the service.</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "Sophia Reyes", r: "Founder & CEO" },
              { n: "Marcus Chen", r: "Head of Operations" },
              { n: "Priya Anand", r: "Client Experience" },
            ].map((m) => (
              <div key={m.n} className="flex items-center gap-5 rounded-2xl border border-border bg-card p-6">
                <div className="h-14 w-14 shrink-0 rounded-full bg-surface" />
                <div>
                  <div className="text-base font-medium text-foreground">{m.n}</div>
                  <div className="text-sm text-ink-muted">{m.r}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
