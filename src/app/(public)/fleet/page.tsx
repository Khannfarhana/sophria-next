import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_CUTOUTS } from "@/lib/vehicles";
import { ArrowRight, Users, Luggage } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { queries as mockDb } from "@/data/data";

export const metadata: Metadata = {
  title: "Fleet",
  description: "Mercedes, BMW, Cadillac. Sedans, SUVs, limousines and sprinters for any occasion across Toronto and Southern Ontario.",
  openGraph: {
    title: "SophRia Fleet",
    description: "Late-model luxury vehicles for any occasion.",
  },
};

export default async function FleetPage() {
  const { data: dbVehicles } = SUPABASE_ENABLED
    ? await supabase.from("vehicles").select("*").eq("is_active", true).order("sort_order").order("base_rate")
    : { data: null };
  const vehicles = dbVehicles?.length ? dbVehicles : mockDb.activeVehicles();

  return (
    <SiteLayout>
      <PageHero
        eyebrow="The Fleet"
        title={<>Every vehicle, <span className="text-gold-soft">considered.</span></>}
        sub="Curated and maintained to a single standard — from quiet executive sedans to celebration coaches."
      />

      {/* Showroom — each class on its own spotlight stage, alternating sides */}
      <section className="overflow-hidden bg-night px-6 pb-20 text-white md:pb-28">
        <div className="mx-auto max-w-7xl">
          {!vehicles || vehicles.length === 0 ? (
            <div className="py-32 text-center text-white/60">No vehicles available at this time.</div>
          ) : (
            vehicles.map((v, i) => {
              // Convention: the first feature names the models in the class
              // ("Cadillac LYRIQ / Lexus ES"); the rest are amenities.
              const [modelLine, ...amenities] = v.features?.length
                ? v.features
                : [v.name];
              const flip = i % 2 === 1;
              const index = String(i + 1).padStart(2, "0");
              return (
                <article
                  key={v.id}
                  className="relative grid items-center gap-10 py-16 md:grid-cols-12 md:gap-6 md:py-24"
                >
                  {/* Stage */}
                  <div className={`relative md:col-span-7 ${flip ? "md:order-2" : ""}`}>
                    {/* Ghosted index number */}
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute -top-14 select-none font-display text-[9rem] leading-none text-white/[0.05] md:-top-24 md:text-[15rem] ${
                        flip ? "right-0" : "left-0"
                      }`}
                    >
                      {index}
                    </span>
                    {/* Spotlight + floor shadow */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_62%,rgba(201,167,106,0.09),transparent_65%)]"
                    />
                    <div
                      aria-hidden
                      className="absolute bottom-4 left-1/2 h-12 w-3/4 -translate-x-1/2 rounded-[100%] bg-black/80 blur-2xl"
                    />
                    <Image
                      src={VEHICLE_CUTOUTS[v.type] ?? VEHICLE_CUTOUTS.sedan}
                      alt={`${v.name} — ${modelLine}`}
                      sizes="(max-width: 768px) 100vw, 720px"
                      className="relative mx-auto w-full max-w-2xl object-contain brightness-[.84] contrast-[1.06] saturate-[.88] drop-shadow-[0_40px_35px_rgba(0,0,0,0.6)] transition-transform duration-700 ease-out hover:scale-[1.02]"
                    />
                  </div>

                  {/* Copy */}
                  <div className={`relative md:col-span-5 ${flip ? "md:order-1 md:pr-8" : "md:pl-8"}`}>
                    <div className="flex items-center gap-3 text-xs tracking-[0.3em] text-gold">
                      {index}
                      <span aria-hidden className="h-px w-10 bg-gold/40" />
                    </div>
                    <h2 className="mt-4 font-display text-5xl leading-[1.02] md:text-6xl">
                      {v.name}
                    </h2>
                    <div className="mt-3 text-sm font-medium text-white/60">{modelLine}</div>
                    <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
                      {v.description}
                    </p>
                    {amenities.length > 0 && (
                      <p className="mt-4 max-w-md text-xs leading-relaxed text-white/45">
                        {amenities.join("  ·  ")}
                      </p>
                    )}

                    {/* Spec strip */}
                    <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-white/10 py-4 text-[11px] uppercase tracking-[0.2em] text-gold-soft">
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-gold" aria-hidden />
                        {v.capacity} passengers
                      </span>
                      <span className="flex items-center gap-2">
                        <Luggage className="h-3.5 w-3.5 text-gold" aria-hidden />
                        {v.luggage} bags
                      </span>
                      <span className="text-white">
                        from ${Number(v.base_rate).toFixed(0)}{" "}
                        <span className="text-white/50">CAD</span>
                      </span>
                    </div>

                    <Link
                      href={`/book?q=${encodeURIComponent(`vehicle=${v.type}`)}`}
                      className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-300 hover:gap-3 hover:bg-gold-soft"
                    >
                      Book this class
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
