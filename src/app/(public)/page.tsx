"use client";

import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { BookingWidget } from "@/components/site/BookingWidget";
import { ShieldCheck, Clock, Sparkles, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import { VEHICLE_IMAGES } from "@/lib/vehicles";
import Image from "next/image";

export default function Home() {
  return (
    <SiteLayout>
      {/* Hero */}
      <section className="relative isolate min-h-[92vh] overflow-hidden bg-background">
        <div className="absolute inset-0 animate-kenburns">
          <Image
            src={heroImg}
            alt="Luxury black sedan on Toronto street at night"
            fill
            priority
            className="object-cover opacity-30"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        {/* subtle vignette glow */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-foreground/5 blur-3xl" />

        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-end px-6 pb-16 pt-32 md:pb-24">
          <div className="eyebrow mb-6 animate-rise">Toronto · Est. 2018</div>
          <h1 className="max-w-3xl text-5xl leading-[1.05] md:text-7xl animate-rise delay-100">
            Toronto's premier <br />
            <span className="shimmer-text">chauffeur service.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-ink-muted md:text-lg animate-rise delay-200">
            Discreet. Punctual. Effortless. Reserve a private driver for any occasion across the GTA — from Pearson arrivals to evening galas.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 animate-rise delay-300">
            <Link
              href="/book"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:gap-3 hover:bg-[#2A2A2A] animate-pulse-ring"
            >
              Book Your Ride
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/fleet"
              className="group inline-flex items-center gap-2 rounded-sm border border-border px-6 py-3 text-sm text-foreground transition-all duration-300 hover:gap-3 hover:border-foreground hover:bg-card"
            >
              View Fleet
              <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
            </Link>
          </div>
        </div>
      </section>

      {/* Booking widget */}
      <section className="relative -mt-12 px-6">
        <div className="mx-auto max-w-6xl animate-rise delay-500">
          <BookingWidget />
        </div>
      </section>

      {/* Why SophRia */}
      <section className="bg-surface px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 max-w-2xl">
            <div className="eyebrow mb-4">Why SophRia</div>
            <h2 className="text-4xl md:text-5xl">An uncompromising standard.</h2>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-3">
            {[
              { Icon: ShieldCheck, title: "Professional Chauffeurs", body: "Vetted, licensed, and trained to the highest standard. Discretion is non-negotiable." },
              { Icon: Sparkles, title: "Luxury Fleet", body: "Late-model Mercedes, BMW, and Cadillac vehicles — meticulously maintained inside and out." },
              { Icon: Clock, title: "On-Time Guarantee", body: "Live flight tracking and 24/7 dispatch. We arrive before you do, every time." },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="group relative bg-background p-10 transition-colors duration-500 hover:bg-card"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-sm border border-border transition-all duration-500 group-hover:border-foreground group-hover:scale-110">
                  <Icon className="h-5 w-5 text-foreground transition-transform duration-500 group-hover:rotate-6" />
                </div>
                <h3 className="mt-8 text-2xl">{title}</h3>
                <p className="mt-3 text-sm text-ink-muted">{body}</p>
                <div className="absolute bottom-0 left-0 h-px w-0 bg-foreground transition-all duration-700 group-hover:w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fleet preview */}
      <section className="px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 flex items-end justify-between">
            <div>
              <div className="eyebrow mb-4">The Fleet</div>
              <h2 className="text-4xl md:text-5xl">Choose your moment.</h2>
            </div>
            <Link href="/fleet" className="reveal-underline hidden text-sm text-ink-muted hover:text-foreground md:inline-block">View all →</Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { key: "sedan", name: "Luxury Sedan", cap: "1–3 guests", desc: "Mercedes S-Class. For executive travel." },
              { key: "suv", name: "Luxury SUV", cap: "1–6 guests", desc: "Cadillac Escalade. Group comfort." },
              { key: "limousine", name: "Stretch Limousine", cap: "1–8 guests", desc: "Classic. For special occasions." },
            ].map((v) => (
              <Link href="/fleet" key={v.key} className="group block">
                <div className="card-lift overflow-hidden rounded-sm border border-border bg-card">
                  <div className="aspect-[4/3] overflow-hidden bg-black relative">
                    <Image
                      src={VEHICLE_IMAGES[v.key]}
                      alt={v.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition duration-[1200ms] ease-out group-hover:scale-110"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-xl transition-colors group-hover:text-foreground">{v.name}</h3>
                      <span className="text-xs text-ink-soft">{v.cap}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-muted">{v.desc}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-ink-soft opacity-0 -translate-y-1 transition-all duration-500 group-hover:opacity-100 group-hover:translate-y-0">
                      Explore <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Drive with us */}
      <section className="bg-surface px-6 py-32">
        <div className="mx-auto grid max-w-7xl gap-16 md:grid-cols-2 md:items-center">
          <div>
            <div className="eyebrow mb-4">Drive with us</div>
            <h2 className="text-4xl md:text-5xl">Become a SophRia chauffeur.</h2>
            <p className="mt-6 text-ink-muted">
              Join Toronto's most discerning private fleet. We partner with vetted, licensed professionals who share our standard of discretion and craft.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-ink-muted">
              <li>— Competitive earnings on every ride</li>
              <li>— Flexible schedule, premium clientele</li>
              <li>— Full support from our 24/7 dispatch</li>
            </ul>
            <Link
              href="/become-chauffeur"
              className="group mt-10 inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:gap-3 hover:bg-[#2A2A2A]"
            >
              Apply to Drive
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="card-lift rounded-sm border border-border bg-card p-10">
            <div className="eyebrow mb-6">Requirements</div>
            <div className="space-y-5 text-sm">
              {[
                { k: "License", v: "Valid Ontario G license, 3+ years" },
                { k: "Vehicle", v: "Late-model luxury sedan or SUV (optional)" },
                { k: "Record", v: "Clean abstract & background check" },
                { k: "Insurance", v: "Commercial coverage in good standing" },
              ].map((r) => (
                <div key={r.k} className="flex justify-between gap-6 border-b border-border pb-4 last:border-0">
                  <span className="text-ink-soft">{r.k}</span>
                  <span className="text-right text-foreground">{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden px-6 py-32">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/5 blur-3xl" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <h2 className="text-4xl md:text-5xl">Ready when <span className="shimmer-text">you</span> are.</h2>
          <p className="mt-4 max-w-lg text-ink-muted">Reserve a chauffeur in under a minute. Available 24/7 across the Greater Toronto Area.</p>
          <Link
            href="/book"
            className="group mt-10 inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-sm font-medium text-primary-foreground transition-all duration-300 hover:gap-3 hover:bg-[#2A2A2A] animate-pulse-ring"
          >
            Book Now
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}
