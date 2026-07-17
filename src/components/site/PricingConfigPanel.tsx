"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { publishPricingConfigAction } from "@/lib/pricing-actions";
import { priceBreakdown } from "@/lib/pricing";
import { rideMargin, type PricingConfig } from "@/lib/pricing-config";
import { resolvePearsonTariff } from "@/lib/tariff";
import { useAuth } from "@/lib/use-auth";

/**
 * The rate card, editable.
 *
 * The form is the easy half. The half that matters is the PREVIEW: an operator
 * changing "0.30" to "0.05" should not have to imagine what that does — they
 * should see the fare on their busiest route move before they publish. Handing
 * someone raw decimals with a Save button is how a 13% HST becomes 1300%.
 *
 * Sample trips are real: T3 -> 1 de Boers (SophRia's own address, the client's
 * own test case) and T3 -> Downtown, sedan and SUV, priced through the very
 * same priceBreakdown() the server uses.
 */

type Draft = Record<string, string | boolean>;

/** Field groups, in the order an operator thinks about them. */
const FIELDS: { key: keyof PricingConfig; col: string; label: string; hint?: string; pct?: boolean }[] = [
  { key: "tariffMarkupRate", col: "tariff_markup_rate", label: "Markup on Pearson tariffs", hint: "Applied to tariff fares only — never to hourly or one-way, which already price off your retail rates.", pct: true },
  { key: "yyzAirportFee", col: "yyz_airport_fee", label: "GTAA airport fee", hint: "Passed through to the passenger and remitted to the airport. Not revenue — excluded from the driver's share." },
  { key: "airportMeetGreet", col: "airport_meet_greet", label: "Meet & greet", hint: "Non-Pearson airport trips. Market (Jul 2026) charges $45–$80 for this." },
  { key: "hstRate", col: "hst_rate", label: "HST", hint: "Statutory. Changes by legislation, not by decision.", pct: true },
  { key: "defaultDriverPayoutRate", col: "default_driver_payout_rate", label: "Driver's share", hint: "The DRIVER's cut, not yours. 75% pays the chauffeur 75% and keeps 25%.", pct: true },
  { key: "defaultTipRate", col: "default_tip_rate", label: "Suggested tip", pct: true },
  { key: "retailPerKm", col: "retail_per_km", label: "Retail per km", hint: "Your one-way rate. Not the GTAA's." },
  { key: "hourlyMinHours", col: "hourly_min_hours", label: "Hourly minimum (hours)" },
  { key: "tariffPerKm", col: "tariff_per_km", label: "Tariff per km (outside zone map)", hint: "Published GTAA rate: $2.01/km." },
  { key: "tariffInZoneBase", col: "tariff_in_zone_base", label: "In-zone base" },
  { key: "tariffMin", col: "tariff_min", label: "Minimum tariff" },
  { key: "extraPassengerSurcharge", col: "extra_passenger_surcharge", label: "Extra passenger / baggage surcharge", hint: "Applied automatically: >4 passengers and/or bags over the vehicle's rating, once per trip." },
  { key: "multiDropoffCharge", col: "multi_dropoff_charge", label: "Extra drop-off, each", hint: "REFERENCE ONLY — not charged automatically. The tariff allows $15 per passenger dropped off on route, but a booking doesn't say who gets out where. Use it when adjusting a fare." },
  { key: "stopWaitPer10Min", col: "stop_wait_per_10min", label: "Requested stop, per 10 min", hint: "REFERENCE ONLY — not charged automatically. Wait time isn't known until the ride happens; dispatch applies it afterwards." },
  { key: "stripePct", col: "stripe_pct", label: "Stripe %", hint: "A COST, not a charge. Stripe bills on the whole transaction — tax and airport fee included.", pct: true },
  { key: "stripeFixed", col: "stripe_fixed", label: "Stripe fixed fee" },
];

const SEDAN = { base_rate: 95, hourly_rate: 85, type: "sedan", tariff_multiplier: 1.0 };
const SUV = { base_rate: 130, hourly_rate: 120, type: "suv", tariff_multiplier: 1.3 };
const T3 = { lng: -79.6306, lat: 43.6853 };
const SAMPLES = [
  { label: "T3 → 1 de Boers Dr", dropoff: "1 de Boers Drive, North York", coords: { lng: -79.5219, lat: 43.7364 }, km: 13.5 },
  { label: "T3 → Downtown", dropoff: "King St W & Bay St, Toronto", coords: { lng: -79.3808, lat: 43.6487 }, km: 26.7 },
];

export function PricingConfigPanel({ config }: { config: PricingConfig }) {
  // Read-only for an admin without `pricing`. The server enforces this — the
  // check here only avoids offering a button that would just error.
  const { roles } = useAuth();
  const canPublish = roles.includes("pricing");
  const [draft, setDraft] = useState<Draft>({});
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const qc = useQueryClient();

  // The draft, resolved into a real config the fare engine can price with.
  const next = useMemo<PricingConfig>(() => {
    const out: PricingConfig = { ...config };
    for (const f of FIELDS) {
      const raw = draft[f.col];
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) (out as unknown as Record<string, unknown>)[f.key] = f.pct ? n / 100 : n;
    }
    if (draft.tariff_tax_inclusive !== undefined) out.tariffTaxInclusive = Boolean(draft.tariff_tax_inclusive);
    return out;
  }, [draft, config]);

  const dirty = Object.keys(draft).length > 0;

  const rows = SAMPLES.flatMap((s) =>
    ([["Sedan", SEDAN], ["SUV", SUV]] as const).map(([vn, v]) => {
      // Returns the SEDAN tariff — quote() applies the vehicle's class
      // multiplier, so this is resolved once per trip, not per vehicle.
      const tariff = resolvePearsonTariff({
        pickup: "Toronto Pearson International Airport Terminal 3",
        dropoff: s.dropoff, pickupCoords: T3, dropoffCoords: s.coords,
        distanceKm: s.km,
      });
      const before = priceBreakdown("airport", v, { distanceKm: s.km, tariff }, config);
      const after = priceBreakdown("airport", v, { distanceKm: s.km, tariff }, next);
      const m = rideMargin({ total: after.total, hst: after.hst, airportFee: after.airportFee, driverRate: next.defaultDriverPayoutRate, config: next });
      return { label: `${s.label} · ${vn}`, before: before.total, after: after.total, net: m.net };
    }),
  );

  const publish = () => {
    const patch: Record<string, number | boolean> = {};
    for (const f of FIELDS) {
      const raw = draft[f.col];
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) patch[f.col] = f.pct ? n / 100 : n;
    }
    if (draft.tariff_tax_inclusive !== undefined) patch.tariff_tax_inclusive = Boolean(draft.tariff_tax_inclusive);
    start(async () => {
      try {
        await publishPricingConfigAction({ patch, reason });
        toast.success("Rate card published — new bookings quote the new prices.");
        setDraft({});
        setReason("");
        qc.invalidateQueries({ queryKey: ["pricing-config"] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not publish");
      }
    });
  };

  const val = (f: (typeof FIELDS)[number]) => {
    const d = draft[f.col];
    if (d !== undefined) return String(d);
    const cur = config[f.key] as number;
    return String(f.pct ? Math.round(cur * 1000) / 10 : cur);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.col} className="block">
            <span className="text-sm font-medium text-foreground">
              {f.label} {f.pct && <span className="text-ink-muted">(%)</span>}
            </span>
            <input
              type="number"
              step="any"
              value={val(f)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))}
              disabled={!canPublish}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            {f.hint && <span className="mt-1 block text-xs text-ink-muted">{f.hint}</span>}
          </label>
        ))}
      </div>

      <label className="flex items-start gap-3 rounded-md border border-border p-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.tariff_tax_inclusive !== undefined ? Boolean(draft.tariff_tax_inclusive) : config.tariffTaxInclusive}
          onChange={(e) => setDraft((d) => ({ ...d, tariff_tax_inclusive: e.target.checked }))}
        />
        <span>
          <span className="text-sm font-medium text-foreground">Pearson tariffs already include HST</span>
          <span className="mt-1 block text-xs text-ink-muted">
            The official GTAA card says so: &ldquo;All tariffs in Canadian dollars and includes taxes.&rdquo; With this on,
            a tariff is converted to its pre-tax value before markup and HST, so tax is charged once. Turn it off only if
            the tariff table is ever replaced with a pre-tax rate sheet.
          </span>
        </span>
      </label>

      {/* The preview. This is the point of the whole screen. */}
      <div className="rounded-md border border-border">
        <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink-muted">
          What this does to real fares
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-normal">Trip</th>
              <th className="px-4 py-2 text-right font-normal">Now</th>
              <th className="px-4 py-2 text-right font-normal">After</th>
              <th className="px-4 py-2 text-right font-normal">Change</th>
              <th className="px-4 py-2 text-right font-normal">Your net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.after - r.before;
              return (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-4 py-2">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-muted">${r.before.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">${r.after.toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${Math.abs(delta) < 0.005 ? "text-ink-muted" : delta < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {Math.abs(delta) < 0.005 ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">${r.net.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-border px-4 py-2 text-xs text-ink-muted">
          &ldquo;Your net&rdquo; is what the business keeps after the driver&rsquo;s share, the GTAA fee, HST and Stripe&rsquo;s
          cut — Stripe bills on the whole transaction, pass-throughs included.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="text-sm font-medium text-foreground">Why are you changing this?</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. GTAA raised the pickup fee to $18.50"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-ink-muted">
            Kept forever against this version. Publishing never overwrites the old rates — it adds a new version, so you
            can always see who changed what, and roll back.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={publish}
            disabled={!canPublish || !dirty || reason.trim().length < 5 || pending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish new rates
          </button>
          {dirty && (
            <button onClick={() => setDraft({})} className="text-sm text-ink-muted hover:text-foreground">
              Discard
            </button>
          )}
          {!canPublish && (
            <span className="text-xs text-ink-muted">
              Read-only — changing rates needs the <code>pricing</code> role.
            </span>
          )}
          {canPublish && !dirty && <span className="text-xs text-ink-muted">Change a rate to see its effect.</span>}
        </div>
      </div>
    </div>
  );
}
