"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { publishPricingConfigAction } from "@/lib/pricing-actions";
import { priceBreakdown } from "@/lib/pricing";
import { rideMargin, type PricingConfig } from "@/lib/pricing-config";
import { resolvePearsonTariff } from "@/lib/tariff";
import { useTariffDestinations } from "@/hooks/use-tariff-destinations";
import { useAuth } from "@/lib/use-auth";

/**
 * The rate card, editable.
 *
 * Two rules keep this screen understandable:
 * 1. Fields are grouped by the question an operator is actually asking
 *    ("what do I charge?", "what does the driver get?") — and the rarely
 *    touched machinery (tariff internals, taxes) stays folded away.
 * 2. The live preview is always in view: change a number, watch the fare on
 *    the busiest routes move BEFORE publishing. Handing someone raw decimals
 *    with a Save button is how a 13% HST becomes 1300%.
 */

type Draft = Record<string, string | boolean>;

interface Field {
  key: keyof PricingConfig;
  col: string;
  label: string;
  hint?: string;
  pct?: boolean;
  /** Input suffix: "$", "%", "/km", "h" … purely presentational. */
  unit?: string;
  prefix?: string;
}

/** Grouped the way an operator thinks, most-touched groups first. */
const GROUPS: { title: string; blurb?: string; open: boolean; fields: Field[] }[] = [
  {
    title: "What you charge",
    blurb: "Your own retail rates — the everyday levers.",
    open: true,
    fields: [
      { key: "retailPerKm", col: "retail_per_km", label: "One-way rate, per km", prefix: "$", unit: "/km", hint: "The fleet-wide rate. A vehicle with its own per-km rate (Admin → Fleet) overrides this." },
      { key: "onewayFreeKm", col: "oneway_free_km", label: "Included km on one-way", unit: "km", hint: "Kilometres the base fare covers before per-km billing starts. 0 bills from the first km." },
      { key: "hourlyMinHours", col: "hourly_min_hours", label: "Hourly minimum", unit: "hours" },
    ],
  },
  {
    title: "Driver & tips",
    blurb: "How the fare is shared.",
    open: true,
    fields: [
      { key: "defaultDriverPayoutRate", col: "default_driver_payout_rate", label: "Driver's share", pct: true, unit: "%", hint: "The DRIVER's cut. 75% pays the chauffeur 75% and keeps 25%." },
      { key: "defaultTipRate", col: "default_tip_rate", label: "Suggested tip", pct: true, unit: "%" },
    ],
  },
  {
    title: "Airport",
    blurb: "Fees and markup on airport work.",
    open: true,
    fields: [
      { key: "yyzAirportFee", col: "yyz_airport_fee", label: "GTAA airport fee", prefix: "$", hint: "Passed through to the passenger and remitted to the airport — excluded from the driver's share." },
      { key: "airportMeetGreet", col: "airport_meet_greet", label: "Meet & greet", prefix: "$", hint: "Non-Pearson airports. Market charges $45–$80." },
      { key: "airportFreeKm", col: "airport_free_km", label: "Airport free km", unit: "km", hint: "Non-Pearson formula only — km included before per-km billing." },
      { key: "tariffMarkupRate", col: "tariff_markup_rate", label: "Markup on Pearson tariffs", pct: true, unit: "%", hint: "Tariff fares only — never hourly or one-way." },
    ],
  },
  {
    title: "Pearson tariff machinery",
    blurb: "The GTAA's published numbers. You'll rarely touch these.",
    open: false,
    fields: [
      { key: "tariffPerKm", col: "tariff_per_km", label: "Tariff per km (outside zone map)", prefix: "$", unit: "/km", hint: "Published GTAA rate: $2.01/km." },
      { key: "tariffInZoneBase", col: "tariff_in_zone_base", label: "In-zone base", prefix: "$" },
      { key: "tariffMin", col: "tariff_min", label: "Minimum tariff", prefix: "$" },
      { key: "pearsonRadiusKm", col: "pearson_radius_km", label: "Pearson radius", unit: "km", hint: "How close to the terminals counts as “at the airport”." },
      { key: "extraPassengerSurcharge", col: "extra_passenger_surcharge", label: "Extra passenger / baggage surcharge", prefix: "$", hint: "Applied automatically: >4 passengers or bags over the vehicle's rating, once per trip." },
    ],
  },
  {
    title: "Taxes & card processing",
    blurb: "Statutory and Stripe. Set-and-forget.",
    open: false,
    fields: [
      { key: "hstRate", col: "hst_rate", label: "HST", pct: true, unit: "%", hint: "Changes by legislation, not by decision." },
      { key: "stripePct", col: "stripe_pct", label: "Stripe %", pct: true, unit: "%", hint: "A COST, not a charge — billed on the whole transaction." },
      { key: "stripeFixed", col: "stripe_fixed", label: "Stripe fixed fee", prefix: "$" },
    ],
  },
  {
    title: "Reference charges (never automatic)",
    blurb: "Dispatch applies these by hand when adjusting a fare.",
    open: false,
    fields: [
      { key: "multiDropoffCharge", col: "multi_dropoff_charge", label: "Extra drop-off, each", prefix: "$", hint: "The tariff allows $15 per passenger dropped en route — a booking doesn't say who gets out where." },
      { key: "stopWaitPer10Min", col: "stop_wait_per_10min", label: "Requested stop, per 10 min", prefix: "$", hint: "Wait time isn't known until the ride happens." },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);

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
  const tariffDestinations = useTariffDestinations();

  // The draft, resolved into a real config the fare engine can price with.
  const next = useMemo<PricingConfig>(() => {
    const out: PricingConfig = { ...config };
    for (const f of ALL_FIELDS) {
      const raw = draft[f.col];
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) (out as unknown as Record<string, unknown>)[f.key] = f.pct ? n / 100 : n;
    }
    if (draft.tariff_tax_inclusive !== undefined) out.tariffTaxInclusive = Boolean(draft.tariff_tax_inclusive);
    return out;
  }, [draft, config]);

  // Empty strings are a mid-typing state, not a change — publish skips them,
  // so the dirty flag and per-field markers must too.
  const dirty = Object.entries(draft).some(([, v]) => v !== "");

  const rows = SAMPLES.flatMap((s) =>
    ([["Sedan", SEDAN], ["SUV", SUV]] as const).map(([vn, v]) => {
      // Returns the SEDAN tariff — quote() applies the vehicle's class
      // multiplier, so this is resolved once per trip, not per vehicle.
      const tariff = resolvePearsonTariff(
        {
          pickup: "Toronto Pearson International Airport Terminal 3",
          dropoff: s.dropoff, pickupCoords: T3, dropoffCoords: s.coords,
          distanceKm: s.km,
        },
        // Priced with the DRAFT config so the tariff-machinery knobs move the
        // preview too, and with the live destination table.
        { cfg: next, destinations: tariffDestinations },
      );
      const before = priceBreakdown("airport", v, { distanceKm: s.km, tariff }, config);
      const after = priceBreakdown("airport", v, { distanceKm: s.km, tariff }, next);
      const m = rideMargin({ total: after.total, hst: after.hst, airportFee: after.airportFee, driverRate: next.defaultDriverPayoutRate, config: next });
      return { label: `${s.label} · ${vn}`, before: before.total, after: after.total, net: m.net };
    }),
  );

  const publish = () => {
    const patch: Record<string, number | boolean> = {};
    for (const f of ALL_FIELDS) {
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

  const currentVal = (f: Field) => {
    const cur = config[f.key] as number;
    return String(f.pct ? Math.round(cur * 1000) / 10 : cur);
  };
  const val = (f: Field) => {
    const d = draft[f.col];
    return d !== undefined ? String(d) : currentVal(f);
  };
  const isChanged = (f: Field) =>
    draft[f.col] !== undefined && draft[f.col] !== "" && String(draft[f.col]) !== currentVal(f);

  const changedInGroup = (fields: Field[]) => fields.filter(isChanged).length;

  const resetField = (f: Field) =>
    setDraft((d) => {
      const out = { ...d };
      delete out[f.col];
      return out;
    });

  const fieldRow = (f: Field): ReactNode => {
    const changed = isChanged(f);
    return (
      <label key={f.col} className="block">
        <span className="mb-1 flex items-center gap-2 text-sm text-white/80">
          {f.label}
          {changed && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); resetField(f); }}
              title="Reset to current value"
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold-soft hover:bg-gold/25"
            >
              <RotateCcw className="h-2.5 w-2.5" /> changed
            </button>
          )}
        </span>
        <div
          className={`flex items-center gap-2 rounded-sm border bg-white/[0.06] px-3 py-2 transition-colors focus-within:border-gold ${
            changed ? "border-gold/60" : "border-white/15"
          }`}
        >
          {f.prefix && <span className="text-sm text-white/50">{f.prefix}</span>}
          <input
            type="number"
            step="any"
            value={val(f)}
            onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))}
            disabled={!canPublish}
            className="w-full bg-transparent text-sm text-white focus:outline-none disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {f.unit && <span className="shrink-0 text-xs text-white/45">{f.unit}</span>}
        </div>
        {f.hint && <span className="mt-1 block text-xs text-white/45">{f.hint}</span>}
      </label>
    );
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      {/* Left: grouped fields */}
      <div className="space-y-4">
        {GROUPS.map((g) => {
          const changed = changedInGroup(g.fields);
          return (
            <details key={g.title} open={g.open || changed > 0} className="group rounded-sm bg-night-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3">
                  <span className="font-display text-lg text-white">{g.title}</span>
                  {changed > 0 && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold-soft">
                      {changed} changed
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {g.blurb && <span className="hidden text-xs text-white/40 sm:block">{g.blurb}</span>}
                  <span aria-hidden className="text-white/40 transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <div className="grid gap-4 border-t border-white/10 p-5 sm:grid-cols-2">
                {g.fields.map(fieldRow)}
                {g.title === "Pearson tariff machinery" && (
                  <label className="flex items-start gap-3 rounded-sm bg-white/[0.04] p-3 sm:col-span-2">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[#c9a76a]"
                      checked={draft.tariff_tax_inclusive !== undefined ? Boolean(draft.tariff_tax_inclusive) : config.tariffTaxInclusive}
                      onChange={(e) => setDraft((d) => ({ ...d, tariff_tax_inclusive: e.target.checked }))}
                      disabled={!canPublish}
                    />
                    <span>
                      <span className="text-sm font-medium text-white">Pearson tariffs already include HST</span>
                      <span className="mt-1 block text-xs text-white/45">
                        The official GTAA card says so. With this on, a tariff is converted to its pre-tax value before
                        markup and HST, so tax is charged once.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {/* Right: live preview + publish, always in view */}
      <div className="space-y-4 lg:sticky lg:top-8">
        <div className="rounded-sm bg-night-card text-white">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="font-display text-lg">Live preview</div>
            <div className="text-xs text-white/45">Real routes, priced with your changes.</div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/45">
                <th className="px-4 py-2 font-normal">Trip</th>
                <th className="px-2 py-2 text-right font-normal">Fare</th>
                <th className="px-4 py-2 text-right font-normal">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = r.after - r.before;
                const changed = Math.abs(delta) >= 0.005;
                return (
                  <tr key={r.label} className="border-t border-white/10">
                    <td className="px-4 py-2.5 text-xs text-white/70">{r.label}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <div className={`font-medium ${changed ? "text-gold-soft" : ""}`}>${r.after.toFixed(2)}</div>
                      {changed && (
                        <div className={`text-[11px] ${delta < 0 ? "text-amber-400" : "text-emerald-300"}`}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(2)} vs now
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">${r.net.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-white/10 px-4 py-2.5 text-[11px] leading-relaxed text-white/40">
            &ldquo;Net&rdquo; = what you keep after the driver&rsquo;s share, GTAA fee, HST and Stripe.
          </p>
        </div>

        <div className="rounded-sm bg-night-card p-4">
          <label className="block">
            <span className="text-sm font-medium text-white">Why are you changing this?</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. GTAA raised the pickup fee to $18.50"
              disabled={!canPublish}
              className="mt-2 w-full rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-gold focus:outline-none disabled:opacity-60"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={publish}
              disabled={!canPublish || !dirty || reason.trim().length < 5 || pending}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-sm bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gold-soft disabled:opacity-40"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish new rates
            </button>
            {dirty && (
              <button onClick={() => setDraft({})} className="cursor-pointer text-sm text-white/60 hover:text-white">
                Discard
              </button>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            {!canPublish
              ? "Read-only — changing rates needs the pricing role."
              : !dirty
              ? "Change a rate on the left to see its effect here."
              : "Publishing adds a new version with your reason — nothing is overwritten, and you can always roll back."}
          </p>
        </div>
      </div>
    </div>
  );
}
