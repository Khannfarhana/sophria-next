import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_IMAGES } from "@/lib/vehicles";
import { Users, Luggage, Check, ArrowRight } from "lucide-react";
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
    ? await supabase.from("vehicles").select("*").eq("is_active", true).order("base_rate")
    : { data: null };
  const vehicles = dbVehicles?.length ? dbVehicles : mockDb.activeVehicles();

  return (
    <SiteLayout>
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-20 pt-36 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">The Fleet</div>
          <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">
            Every vehicle, <span className="text-[#e7d3a8]">considered.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70">
            Curated and maintained to a single standard — from quiet executive sedans to celebration coaches.
          </p>
        </div>
      </section>

      {/* Vehicle grid */}
      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-7xl">
          {!vehicles || vehicles.length === 0 ? (
            <div className="py-32 text-center text-ink-muted">No vehicles available at this time.</div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <article key={v.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="aspect-[4/3] overflow-hidden bg-black relative">
                    <Image
                      src={VEHICLE_IMAGES[v.type] ?? VEHICLE_IMAGES.sedan}
                      alt={v.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-xl font-light text-foreground">{v.name}</h2>
                      <div className="text-right">
                        <div className="text-[10px] text-ink-soft">from</div>
                        <div className="text-base text-foreground">${Number(v.base_rate).toFixed(0)} <span className="text-xs text-ink-soft">CAD</span></div>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{v.description}</p>
                    <div className="mt-4 flex gap-5 border-t border-border pt-4 text-xs text-ink-soft">
                      <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{v.capacity} guests</div>
                      <div className="flex items-center gap-1.5"><Luggage className="h-3.5 w-3.5" />{v.luggage} bags</div>
                    </div>
                    {v.features && v.features.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {v.features.map((f: string) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-ink-muted">
                            <Check className="h-3 w-3 shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link
                      href="/book"
                      className="mt-5 flex items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]"
                    >
                      Book This Vehicle <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
