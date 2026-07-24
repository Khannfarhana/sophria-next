"use client";

import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { BookingWidget } from "@/components/site/BookingWidget";
import { ArrowRight, Star } from "lucide-react";
import heroImgDesktop from "@/assets/hero.jpg";
import heroImgMobile from "@/assets/hero.webp";
import { VEHICLE_CUTOUTS } from "@/lib/vehicles";
import { testimonials } from "@/data/data";
import Image from "next/image";

/* Brand colors come from the tokens in globals.css: night / night-panel / night-card / cream / gold */

function Eyebrow({
  children,
  dark = false,
  center = false,
  className = "",
}: {
  children: React.ReactNode;
  dark?: boolean;
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.22em] ${
        dark ? "text-white/70" : "text-ink-muted"
      } ${center ? "justify-center" : ""} ${className}`}
    >
      <span className="h-px w-8 bg-gold" aria-hidden />
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <SiteLayout>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-night text-white md:min-h-screen">
        <div className="absolute inset-0 animate-kenburns">
          {/* Mobile: portrait hero */}
          <Image
            src={heroImgMobile}
            alt="Black luxury chauffeur sedan on a rainy Toronto street at night with the CN Tower in the background"
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-60 lg:hidden"
          />
          {/* Desktop: original landscape hero */}
          <Image
            src={heroImgDesktop}
            alt="Black luxury chauffeur sedan with illuminated headlights on a city street at night"
            fill
            priority
            sizes="100vw"
            className="hidden object-cover opacity-60 lg:block"
          />
        </div>
        {/* Scrims: vertical fade into the next section + left panel for copy legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-night" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/60 via-black/25 to-transparent md:block" />

        <div className="relative mx-auto flex max-w-7xl flex-col justify-start px-6 pb-20 pt-44 md:min-h-screen md:justify-end md:pt-32 md:pb-24">
          <div className="animate-rise">
            <Eyebrow dark className="mb-6 text-white/70">Toronto · Est. 2018</Eyebrow>
          </div>
          {/* The client asked three times for the full name in bold here
              rather than just "SophRia". */}
          <h1 className="max-w-3xl text-5xl leading-[1.05] md:text-7xl animate-rise delay-100">
            <span className="font-semibold">SophRia</span> <br />
            <span className="font-semibold text-gold-soft">Limousine Services.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/80 md:text-lg animate-rise delay-200">
            Reserve a chauffeur in under a minute, available 24/7 across the Greater Toronto Area, Niagara and Toronto
            Downtown — from Pearson arrivals to evening galas, and across the border.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 animate-rise delay-300">
            <Link
              href="/book"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-sm bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-300 hover:gap-3 hover:bg-[#f1f1f1]"
            >
              Book Your Ride
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/fleet"
              className="group inline-flex items-center gap-2 rounded-sm border border-white/30 px-6 py-3 text-sm text-white transition-all duration-300 hover:gap-3 hover:border-white/60 hover:bg-white/10"
            >
              View Fleet
              <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
            </Link>
          </div>
        </div>
      </section>

      {/* Booking widget — gradient lands exactly on the next section's colour */}
      <section className="relative -mt-16 md:-mt-12 bg-night px-6 pb-16">
        <div className="mx-auto max-w-6xl animate-rise delay-500">
          <BookingWidget />
        </div>
      </section>

      {/* Fleet preview — mini showroom stages, matching /fleet */}
      <section className="bg-night px-6 py-20 text-white md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex items-end justify-between md:mb-16">
            <div>
              <Eyebrow dark>The Fleet</Eyebrow>
              <h2 className="text-4xl md:text-5xl">Choose your moment.</h2>
            </div>
            <Link href="/fleet" className="reveal-underline hidden text-sm text-white/60 hover:text-gold-soft md:inline-block">View all →</Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {/* SUV leads — asked for twice: "In place of luxury sedan first must
                be SUV", because "executive clients don't like to search, what
                comes first that's it". Mirrors the sort_order on /fleet. */}
            {[
              { key: "suv", name: "Luxury SUV", cap: "1–6 guests", desc: "GMC Yukon XL. Group comfort." },
              { key: "sedan", name: "Executive Sedan", cap: "1–3 guests", desc: "Cadillac LYRIQ. For executive travel." },
              { key: "business", name: "Business Class", cap: "1–3 guests", desc: "Mercedes S-Class. First-class comfort." },
            ].map((v) => (
              <Link href="/fleet" key={v.key} className="group block">
                <div className="card-lift overflow-hidden rounded-sm bg-night-card">
                  <div className="relative flex aspect-[16/10] items-center justify-center p-6">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_60%,rgba(201,167,106,0.07),transparent_65%)]"
                    />
                    <Image
                      src={VEHICLE_CUTOUTS[v.key]}
                      alt={v.name}
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="relative max-h-full w-auto object-contain brightness-[.84] contrast-[1.06] saturate-[.88] drop-shadow-[0_25px_20px_rgba(0,0,0,0.55)] transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-6 pt-2">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-xl">{v.name}</h3>
                      <span className="text-xs text-white/50">{v.cap}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/65">{v.desc}</p>
                    {/* Visible on touch; hover-reveal on pointer devices */}
                    <div className="mt-4 flex items-center gap-2 text-xs text-gold-soft transition-all duration-500 md:-translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
                      Explore <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center md:hidden">
            <Link href="/fleet" className="inline-flex items-center gap-2 text-sm text-white/60 underline underline-offset-4 hover:text-gold-soft">
              View the full fleet <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-night-panel px-6 py-20 text-white md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center md:mb-16">
            <Eyebrow dark center>Client Notes</Eyebrow>
            <h2 className="text-4xl md:text-5xl">Quietly exceptional.</h2>
          </div>
          {/* Mobile: horizontal snap carousel (stacked cards ate the whole
              viewport); desktop keeps the three-up grid. */}
          <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0">
            {testimonials.slice(0, 3).map((t) => (
              <figure
                key={t.id}
                className="flex w-[85vw] max-w-sm shrink-0 snap-center flex-col justify-between rounded-sm bg-night-card p-8 md:w-auto md:max-w-none"
              >
                <div>
                  <div className="flex gap-1" role="img" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        aria-hidden
                        className={`h-3.5 w-3.5 ${i < t.rating ? "fill-gold text-gold" : "text-white/20"}`}
                      />
                    ))}
                  </div>
                  <blockquote className="mt-5 font-display text-xl leading-relaxed text-white">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                </div>
                <figcaption className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs">
                  <span className="font-medium text-white">{t.author}</span>
                  <span className="text-white/50">via {t.source}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Drive with us */}
      <section className="bg-gradient-to-b from-night-panel to-night px-6 py-20 text-white md:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-2 md:items-center md:gap-16">
          <div>
            <Eyebrow dark>Drive with us</Eyebrow>
            <h2 className="text-4xl md:text-5xl">Become a SophRia chauffeur.</h2>
            <p className="mt-6 text-white/75">
              Join Toronto&apos;s most discerning private fleet. We partner with vetted, licensed professionals who share our standard of discretion and craft.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-white/75">
              {[
                "Competitive earnings on every ride",
                "Flexible schedule, premium clientele",
                "Full support from our 24/7 dispatch",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="h-px w-5 shrink-0 bg-gold" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/become-chauffeur"
              className="group mt-10 inline-flex items-center gap-2 rounded-sm bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-300 hover:gap-3 hover:bg-[#f1f1f1]"
            >
              Apply to Drive
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="rounded-sm border border-white/15 bg-white/5 p-8 backdrop-blur-sm md:p-10">
            <div className="mb-6 text-xs uppercase tracking-[0.22em] text-white/55">Requirements</div>
            <div className="space-y-5 text-sm">
              {[
                { k: "License", v: "Valid Ontario G license, 3+ years" },
                { k: "Vehicle", v: "Late-model luxury sedan or SUV (optional)" },
                { k: "Record", v: "Clean abstract & background check" },
                { k: "Insurance", v: "Commercial coverage in good standing" },
              ].map((r) => (
                <div key={r.k} className="flex justify-between gap-6 border-b border-white/15 pb-4 last:border-0">
                  <span className="text-white/55">{r.k}</span>
                  <span className="text-right text-white">{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-night px-6 py-20 text-white md:py-32">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <Eyebrow dark center>Reserve</Eyebrow>
          <h2 className="text-4xl md:text-5xl">Ready when <span className="text-gold-soft">you</span> are.</h2>
          <p className="mt-4 max-w-lg text-white/70">Reserve a chauffeur in under a minute. Available 24/7 across Toronto, Hamilton, Niagara and Southern Ontario.</p>
          <Link
            href="/book"
            className="group mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-medium text-black transition-all duration-300 hover:gap-3 hover:bg-gold-soft"
          >
            Book Now
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}
