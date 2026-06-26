import Link from "next/link";
import { SiteLayout } from "@/components/site/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_IMAGES } from "@/lib/vehicles";
import { Users, Luggage, Check } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fleet",
  description: "Mercedes, BMW, Cadillac. Sedans, SUVs, limousines and party buses for any occasion in Toronto.",
  openGraph: {
    title: "SophRia Fleet",
    description: "Late-model luxury vehicles for any occasion.",
  },
};

export default async function FleetPage() {
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .eq("is_active", true)
    .order("base_rate");

  return (
    <SiteLayout>
      <section className="px-6 pb-16 pt-32 bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="eyebrow mb-6">The Fleet</div>
          <h1 className="text-5xl md:text-6xl font-light text-foreground">Every vehicle, considered.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-muted">From quiet executive sedans to celebration coaches — our fleet is curated and maintained to a single standard.</p>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto max-w-7xl">
          {!vehicles || vehicles.length === 0 ? (
            <div className="py-32 text-center text-ink-muted">No vehicles available at this time.</div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <article key={v.id} className="overflow-hidden rounded-sm border border-border bg-card">
                  <div className="aspect-[4/3] overflow-hidden bg-black relative">
                    <Image
                      src={VEHICLE_IMAGES[v.type] ?? VEHICLE_IMAGES.sedan}
                      alt={v.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-2xl font-light text-foreground">{v.name}</h2>
                      <div className="text-right">
                        <div className="text-xs text-ink-soft">from</div>
                        <div className="text-lg text-foreground">${Number(v.base_rate).toFixed(0)} <span className="text-xs text-ink-soft">CAD</span></div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-ink-muted">{v.description}</p>
                    <div className="mt-5 flex gap-6 border-t border-border pt-4 text-xs text-ink-muted">
                      <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />{v.capacity} guests</div>
                      <div className="flex items-center gap-2"><Luggage className="h-3.5 w-3.5" />{v.luggage} bags</div>
                    </div>
                    {v.features && v.features.length > 0 && (
                      <ul className="mt-4 space-y-1.5">
                        {v.features.map((f: string) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-ink-muted"><Check className="h-3 w-3" />{f}</li>
                        ))}
                      </ul>
                    )}
                    <Link href="/book" className="mt-6 block rounded-sm bg-primary py-3 text-center text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] cursor-pointer">
                      Book This Vehicle
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
