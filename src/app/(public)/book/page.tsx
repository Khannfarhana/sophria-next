"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { VEHICLE_IMAGES } from "@/lib/vehicles";
import { Check, ArrowRight, ArrowLeft, Sparkles, Users, Luggage, Download, Plus, X } from "lucide-react";
import Image from "next/image";
import { createBookingAction } from "@/lib/actions";
import { TripTypeToggle } from "@/components/site/TripTypeToggle";
import { AddressAutocomplete } from "@/components/site/AddressAutocomplete";
import { RideMap } from "@/components/site/RideMap";
import { getDirections, type Place } from "@/lib/mapbox";
import { formatDateTime, isFuturePickup, minPickupLocalValue } from "@/lib/datetime";
import { usePricingConfig } from "@/hooks/use-pricing-config";
import { priceBreakdown, tripTypeLabel, HOURLY_MIN_HOURS, type TripType } from "@/lib/pricing";
import { MAX_STOPS, isFilledStop, routableStops, type BookingStop } from "@/lib/stops";
import { resolvePearsonTariff } from "@/lib/tariff";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { queries as mockDb } from "@/data/data";
import { mockCreateBooking } from "@/lib/mock-db/actions";

type Coords = { lng: number; lat: number } | null;

interface BookVehicle {
  id: string;
  name: string;
  type: string;
  capacity: number;
  luggage: number;
  features: string[];
  description: string | null;
  image_url: string | null;
  base_rate: number;
  hourly_rate: number | null;
  is_active: boolean;
  created_at: string;
}

type State = {
  tripType: TripType;
  pickup: string;
  dropoff: string;
  pickupCoords: Coords;
  dropoffCoords: Coords;
  /** Intermediate stops, in order. Max MAX_STOPS. */
  stops: BookingStop[];
  distanceKm: number | null;
  durationMin: number | null;
  datetime: string;
  durationHours: number;
  flightNumber: string;
  vehicleId: string | null;
  passengerName: string;
  passengerPhone: string;
  /** Party size — drives the tariff's >4 passenger / excess-baggage surcharge. */
  passengers: number;
  luggage: number;
  notes: string;
};

const STEP_LABELS = ["Trip", "Date & Time", "Vehicle", "Passenger", "Review", "Confirmed"];

export default function BookPage() {
  // Quoting is public — sign-in is required only at the confirm step, and
  // createBookingAction enforces auth server-side regardless. The Suspense
  // boundary is required to prerender a page that reads useSearchParams.
  return (
    <Suspense fallback={<div className="min-h-screen bg-night" />}>
      <BookFlow />
    </Suspense>
  );
}

function BookFlow() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useSupabase();

  // The live rate card. Drives the PREVIEW only — the server recomputes the
  // fare from its own read and ignores whatever this quotes.
  const pricingConfig = usePricingConfig();
  const [step, setStep] = useState(1);
  const [reference, setReference] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [s, setS] = useState<State>({
    tripType: "one_way", pickup: "", dropoff: "",
    pickupCoords: null, dropoffCoords: null, stops: [], distanceKm: null, durationMin: null,
    datetime: "", durationHours: HOURLY_MIN_HOURS, flightNumber: "", vehicleId: null,
    passengerName: "", passengerPhone: "", passengers: 1, luggage: 0, notes: "",
  });

  // Guest quotes survive the sign-in round-trip: state is stashed under this
  // key before redirecting to /auth and restored (once) on return.
  const PENDING_KEY = "sophria-pending-booking";

  // Interlocks between the two mount-time state writers (stash restore vs the
  // ?q= handoff): whichever applies first wins, and q is applied at most once.
  const restoredRef = useRef(false);
  const qAppliedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_KEY);
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object" && saved.s) {
        // Synchronous flag: the q effect below runs after this one in the same
        // commit and must not clobber a restored quote.
        restoredRef.current = true;
        // Deferred so the restore doesn't set state synchronously inside the effect.
        Promise.resolve().then(() => {
          setS((prev) => ({ ...prev, ...saved.s }));
          setStep(5);
        });
      }
    } catch {
      /* corrupt stash — start fresh */
    }
  }, []);

  const signInToConfirm = () => {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ s }));
    } catch {
      /* storage unavailable — the user just re-enters details */
    }
    router.push("/auth?callbackUrl=%2Fbook");
  };

  const addStop = () =>
    setS((prev) =>
      prev.stops.length >= MAX_STOPS ? prev : { ...prev, stops: [...prev.stops, { address: "", lat: null, lng: null }] },
    );
  const removeStop = (i: number) =>
    setS((prev) => ({ ...prev, stops: prev.stops.filter((_, n) => n !== i) }));
  const setStop = (i: number, stop: BookingStop) =>
    setS((prev) => ({ ...prev, stops: prev.stops.map((st, n) => (n === i ? stop : st)) }));

  const { data: vehicles } = useQuery<BookVehicle[]>({
    queryKey: ["vehicles-book"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockDb.activeVehicles();
      const { data, error } = await supabase.from("vehicles").select("*").eq("is_active", true).order("sort_order").order("base_rate");
      if (error) throw error;
      return data as unknown as BookVehicle[];
    },
  });

  useEffect(() => {
    if (user) {
      Promise.resolve().then(() => {
        setS(prev => ({
          ...prev,
          passengerName: prev.passengerName || ("name" in user ? (user.name ?? "") : ""),
          // Never clear what the user already typed — this effect also fires
          // when a guest returns from the sign-in-to-confirm round-trip.
          passengerPhone: prev.passengerPhone,
        }));
      });
    }
  }, [user]);

  useEffect(() => {
    const q = searchParams.get("q");
    // A restored quote always outranks the URL handoff.
    if (!q || restoredRef.current) return;
    try {
      // searchParams.get() already decoded once — do NOT decode again, or
      // addresses containing & / = / % get corrupted.
      const params = new URLSearchParams(q);

      if (!qAppliedRef.current) {
        qAppliedRef.current = true;
        Promise.resolve().then(() => {
          setS(prev => {
            const tt = (params.get("tripType") as TripType) || prev.tripType;
            const num = (k: string) => (params.get(k) != null ? Number(params.get(k)) : null);
            const pLng = num("pickupLng"), pLat = num("pickupLat");
            const dLng = num("dropoffLng"), dLat = num("dropoffLat");
            return {
              ...prev,
              tripType: ["one_way", "hourly", "airport"].includes(tt) ? tt : prev.tripType,
              pickup: params.get("pickup") || prev.pickup,
              dropoff: params.get("dropoff") || prev.dropoff,
              pickupCoords: pLng != null && pLat != null ? { lng: pLng, lat: pLat } : prev.pickupCoords,
              dropoffCoords: dLng != null && dLat != null ? { lng: dLng, lat: dLat } : prev.dropoffCoords,
              datetime: params.get("datetime") || prev.datetime,
              durationHours: Number(params.get("duration")) || prev.durationHours,
              flightNumber: params.get("flight") || prev.flightNumber,
            };
          });
        });
      }

      // The vehicle preselect has to wait for the vehicles query — it may run
      // on a later pass, but never overwrites a choice the user already made.
      const vehicleType = params.get("vehicle") || "";
      if (vehicles && vehicleType) {
        const match = vehicles.find((v) => v.type === vehicleType);
        if (match) {
          Promise.resolve().then(() =>
            setS((prev) => (prev.vehicleId ? prev : { ...prev, vehicleId: match.id })),
          );
        }
      }
    } catch (err) { console.error(err); }
  }, [searchParams, vehicles]);

  // Stable dep for the directions effect below: it must re-route when a stop's
  // COORDINATES change, not on every keystroke in a stop's address field.
  const stopsKey = routableStops(s.stops).map((p) => `${p.lng},${p.lat}`).join("|");

  // Compute driving distance/duration whenever both endpoints have coordinates.
  useEffect(() => {
    const p = s.pickupCoords, d = s.dropoffCoords;
    if (s.tripType === "hourly" || !p || !d) {
      Promise.resolve().then(() =>
        setS((prev) => (prev.distanceKm == null && prev.durationMin == null ? prev : { ...prev, distanceKm: null, durationMin: null })),
      );
      return;
    }
    let cancelled = false;
    // Route through the stops so the shown distance (and therefore the fare)
    // matches what the server recomputes.
    getDirections(p, d, routableStops(s.stops)).then((dir) => {
      if (cancelled || !dir) return;
      setS((prev) => ({ ...prev, distanceKm: dir.distanceKm, durationMin: dir.durationMin }));
    });
    return () => { cancelled = true; };
    // s.stops is intentionally not a dependency: it is a new array on every
    // keystroke in a stop's address field, which would fire a Mapbox Directions
    // request per character. stopsKey covers it — it changes only when a stop's
    // resolved coordinates do, which is the only thing routing depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.pickupCoords, s.dropoffCoords, s.tripType, stopsKey]);

  const selected = vehicles?.find((v) => v.id === s.vehicleId);
  // Pearson airport trips use the official GTAA tariff — resolved here so the
  // shown estimate matches the server's authoritative fare.
  const pearsonTariff =
    s.tripType === "airport"
      ? resolvePearsonTariff({
          pickup: s.pickup,
          dropoff: s.dropoff,
          pickupCoords: s.pickupCoords ?? undefined,
          dropoffCoords: s.dropoffCoords ?? undefined,
          distanceKm: s.distanceKm,
        })
      : null;
  // Mirrors the server's authoritative breakdown (actions.ts:computeServerFare).
  // `fare` stays the pre-tax subtotal — the server ignores the client's number
  // and recomputes, so this is display-only.
  const bd = priceBreakdown(
    s.tripType,
    selected,
    {
      durationHours: s.durationHours,
      distanceKm: s.distanceKm ?? undefined,
      tariff: pearsonTariff,
      passengerCount: s.passengers,
      luggageCount: s.luggage,
    },
    pricingConfig,
  );
  const fare = bd.subtotal;

  const [confirming, setConfirming] = useState(false);

  const confirm = async () => {
    if (!user || !s.vehicleId || confirming) return;
    setConfirming(true);
    try {
      const payload = {
        vehicleId: s.vehicleId, pickup: s.pickup, dropoff: s.dropoff,
        datetime: s.datetime, fare, passengerName: s.passengerName,
        passengerPhone: s.passengerPhone, notes: s.notes,
        passengerCount: s.passengers, luggageCount: s.luggage,
        tripType: s.tripType,
        // Blank rows are UI scaffolding — never send them.
        stops: s.tripType === "hourly" ? [] : s.stops.filter(isFilledStop),
        durationHours: s.tripType === "hourly" ? s.durationHours : null,
        flightNumber: s.tripType === "airport" ? (s.flightNumber || null) : null,
        pickupLat: s.pickupCoords?.lat ?? null,
        pickupLng: s.pickupCoords?.lng ?? null,
        dropoffLat: s.dropoffCoords?.lat ?? null,
        dropoffLng: s.dropoffCoords?.lng ?? null,
        distanceKm: s.distanceKm,
        durationMin: s.durationMin,
      };
      const res = SUPABASE_ENABLED
        ? await createBookingAction(payload)
        : await mockCreateBooking({ ...payload, customerId: user.id });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setReference(res.reference);
      setOtp(res.start_otp ?? null);
      setStep(6);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setConfirming(false);
    }
  };

  // Build a branded, print-ready receipt and hand it to the browser (Save as PDF).
  const downloadReceipt = () => {
    if (!reference) return;
    // Escape every value interpolated into the receipt HTML — pickup/dropoff/
    // name/notes are user-controlled and this string is written into a new doc.
    const esc = (v: unknown) =>
      String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const dt = s.datetime
      ? formatDateTime(s.datetime, { dateStyle: "full", timeStyle: "short" })
      : "—";
    const rows: [string, string][] = [
      ["Trip type", tripTypeLabel(s.tripType)],
      ["Pickup", s.pickup],
      ...(s.tripType !== "hourly"
        ? (s.stops.filter(isFilledStop).map((st, i) => [`Stop ${i + 1}`, st.address]) as [string, string][])
        : []),
      ...(s.tripType === "hourly"
        ? ([["Duration", `${Math.max(HOURLY_MIN_HOURS, s.durationHours)} hours`]] as [string, string][])
        : ([["Drop-off", s.dropoff]] as [string, string][])),
      ...(s.distanceKm != null ? ([["Distance", `${s.distanceKm.toFixed(1)} km`]] as [string, string][]) : []),
      ...(s.durationMin != null ? ([["Est. drive time", `${Math.round(s.durationMin)} min`]] as [string, string][]) : []),
      ...(s.tripType === "airport" && s.flightNumber ? ([["Flight", s.flightNumber]] as [string, string][]) : []),
      ["Date & time", dt],
      ["Vehicle", selected?.name ?? "—"],
      ["Passenger", s.passengerName],
      ["Fare", `$${(bd.baseFare + bd.markup).toFixed(2)}`],
      ...(bd.airportFee > 0
        ? ([["Airport fee", `$${bd.airportFee.toFixed(2)}`]] as [string, string][])
        : []),
      ["HST (13%)", `$${bd.hst.toFixed(2)}`],
      ...(s.passengerPhone ? ([["Phone", s.passengerPhone]] as [string, string][]) : []),
    ];
    const rowsHtml = rows
      .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>SophRia Receipt ${esc(reference)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;color:#0d0d0e;background:#f1efe9;padding:40px}
  .r{max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e2da;border-radius:14px;overflow:hidden}
  .top{background:#0d0d0e;color:#fff;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-end}
  .brand{font-size:26px;letter-spacing:.04em}
  .brand b{color:#e7d3a8;font-weight:400}
  .top .sub{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55)}
  .ref{padding:22px 32px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
  .ref .lbl{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8a8a8a}
  .ref .num{font-size:30px;letter-spacing:.04em;color:#0d0d0e}
  .badge{border:1px solid #c9a76a;color:#8a6d33;border-radius:999px;padding:5px 14px;font-size:12px;font-family:Arial,sans-serif}
  table{width:100%;border-collapse:collapse}
  td{padding:12px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px}
  td.k{color:#8a8a8a;width:42%}
  td.v{text-align:right;color:#111}
  tr{border-bottom:1px solid #f0efe9}
  .total{display:flex;justify-content:space-between;align-items:center;padding:20px 32px;background:#faf8f3}
  .total .lbl{font-family:Arial,sans-serif;font-size:13px;color:#666}
  .total .amt{font-size:26px;color:#8a6d33}
  .foot{padding:20px 32px;font-family:Arial,sans-serif;font-size:11px;color:#999;line-height:1.6;border-top:1px solid #eee}
  @media print{body{background:#fff;padding:0}.r{border:none}}
</style></head><body>
  <div class="r">
    <div class="top"><div class="brand">Soph<b>Ria</b></div><div class="sub">Chauffeur Receipt</div></div>
    <div class="ref"><div><div class="lbl">Booking reference</div><div class="num">${esc(reference)}</div></div><div class="badge">${esc(tripTypeLabel(s.tripType))}</div></div>
    <table>${rowsHtml}</table>
    <div class="total"><div class="lbl">Estimated total (incl. HST)</div><div class="amt">$${bd.total.toFixed(2)} CAD</div></div>
    <div class="foot">This is an estimate, not a paid invoice. The total includes 13% HST; tolls, parking and waiting time are extra where applicable, and gratuity is added at payment. Once dispatch confirms your reservation you'll receive a secure payment link. Thank you for choosing SophRia — luxury limousine &amp; chauffeur services across Toronto &amp; Southern Ontario.</div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `SophRia-Receipt-${reference}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const inputCls = "w-full rounded-sm border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/40 transition focus:border-gold";

  return (
    <SiteLayout>
      <PageHero
        narrow
        eyebrow="Reserve"
        title={<>Book your <span className="text-gold-soft">ride.</span></>}
        sub="See your fare up front — sign in only when you confirm."
      />

      <section className="bg-night px-6 py-16 text-white">
        <div className="mx-auto max-w-3xl">

          {/* Step indicator */}
          <div className="mb-8">
            <div className="flex items-center gap-1.5">
              {[1,2,3,4,5,6].map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${n <= step ? "bg-gold" : "bg-white/15"}`}
                />
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-xs text-white/50">Step {Math.min(step, 6)} of 6</span>
              <span className="text-xs font-medium text-white/70">{STEP_LABELS[Math.min(step, 6) - 1]}</span>
            </div>
          </div>

          {/* Step card */}
          <div className="rounded-sm bg-night-card p-8">

            {/* Step 1 — Trip details */}
            {step === 1 && (
              <Step title="Trip details">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">Trip type</label>
                  <TripTypeToggle variant="dark" value={s.tripType} onChange={(t) => setS({ ...s, tripType: t })} />
                </div>
                <Field label="Pickup location">
                  <AddressAutocomplete
                    value={s.pickup}
                    onChange={(v) => setS({ ...s, pickup: v, pickupCoords: null })}
                    onSelect={(p: Place) => setS({ ...s, pickup: p.address, pickupCoords: { lng: p.lng, lat: p.lat } })}
                    placeholder="123 Bay St, Toronto"
                    inputClassName={inputCls}
                    mapInitial={s.dropoffCoords}
                    mapTitle="Choose pickup on map"
                  />
                </Field>
                {/* Stops — one-way and airport only. Hourly is "as directed",
                    so the chauffeur follows the passenger on the day rather
                    than a fixed itinerary priced up front. */}
                {s.tripType !== "hourly" &&
                  s.stops.map((stop, i) => (
                    <Field key={i} label={`Stop ${i + 1}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <AddressAutocomplete
                            value={stop.address}
                            onChange={(v) => setStop(i, { address: v, lat: null, lng: null })}
                            onSelect={(p: Place) => setStop(i, { address: p.address, lat: p.lat, lng: p.lng })}
                            placeholder="Where should we stop?"
                            inputClassName={inputCls}
                            mapInitial={s.pickupCoords}
                            mapTitle={`Choose stop ${i + 1} on map`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStop(i)}
                          aria-label={`Remove stop ${i + 1}`}
                          className="mt-2.5 shrink-0 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </Field>
                  ))}
                {s.tripType !== "hourly" && s.stops.length < MAX_STOPS && (
                  <button
                    type="button"
                    onClick={addStop}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 transition hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a stop
                    <span className="text-white/50">
                      ({s.stops.length}/{MAX_STOPS})
                    </span>
                  </button>
                )}

                {s.tripType === "hourly" ? (
                  <Field label="Duration">
                    <select className={inputCls} value={s.durationHours} onChange={(e) => setS({ ...s, durationHours: Number(e.target.value) })}>
                      {Array.from({ length: 11 }, (_, i) => i + HOURLY_MIN_HOURS).map((h) => (
                        <option key={h} value={h}>{h} hours</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label={s.tripType === "airport" ? "Airport / drop-off" : "Drop-off location"}>
                    <AddressAutocomplete
                      value={s.dropoff}
                      onChange={(v) => setS({ ...s, dropoff: v, dropoffCoords: null })}
                      onSelect={(p: Place) => setS({ ...s, dropoff: p.address, dropoffCoords: { lng: p.lng, lat: p.lat } })}
                      placeholder="Toronto Pearson (YYZ)"
                      inputClassName={inputCls}
                      mapInitial={s.pickupCoords}
                      mapTitle="Choose drop-off on map"
                    />
                  </Field>
                )}
                {s.tripType === "airport" && (
                  <Field label="Flight number (optional)">
                    <input className={inputCls} value={s.flightNumber} onChange={(e) => setS({ ...s, flightNumber: e.target.value })} placeholder="AC 118" />
                  </Field>
                )}
                {s.tripType !== "hourly" && s.pickupCoords && s.dropoffCoords && (
                  <div className="space-y-2">
                    <RideMap
                      pickup={s.pickup}
                      dropoff={s.dropoff}
                      pickupCoords={s.pickupCoords}
                      dropoffCoords={s.dropoffCoords}
                      stops={s.stops}
                      height={220}
                    />
                    {s.distanceKm != null && (
                      <p className="text-sm text-white/70">
                        Approx. <span className="font-medium text-white">{s.distanceKm.toFixed(1)} km</span>
                        {s.durationMin != null && <> · {Math.round(s.durationMin)} min drive</>}
                      </p>
                    )}
                  </div>
                )}
                <Nav onNext={() => {
                  if (!s.pickup) { toast.error("Add a pickup location"); return; }
                  if (s.tripType !== "hourly" && !s.dropoff) { toast.error("Add a drop-off location"); return; }
                  setStep(2);
                }} />
              </Step>
            )}

            {/* Step 2 — Date & Time */}
            {step === 2 && (
              <Step title="Date & time">
                <Field label="Pickup date & time">
                  <input
                    type="datetime-local"
                    className={inputCls}
                    // Greys out past slots in the picker. The server re-checks:
                    // `min` is trivially bypassed and is only a convenience.
                    min={minPickupLocalValue()}
                    value={s.datetime}
                    onChange={(e) => setS({ ...s, datetime: e.target.value })}
                  />
                </Field>
                <Nav
                  onBack={() => setStep(1)}
                  onNext={() =>
                    !s.datetime
                      ? toast.error("Pick a date and time")
                      : !isFuturePickup(s.datetime)
                        ? toast.error("Pick-up time must be in the future")
                        : setStep(3)
                  }
                />
              </Step>
            )}

            {/* Step 3 — Choose vehicle */}
            {step === 3 && (
              <Step title="Choose your vehicle">
                <div className="space-y-3">
                  {vehicles?.map((v) => (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-center gap-4 rounded-sm border p-4 transition-all ${
                        s.vehicleId === v.id
                          ? "border-gold bg-white/5"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <input type="radio" name="v" checked={s.vehicleId === v.id} onChange={() => setS({ ...s, vehicleId: v.id })} className="sr-only" />
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                        <Image src={VEHICLE_IMAGES[v.type] ?? VEHICLE_IMAGES.sedan} alt={v.name} fill sizes="96px" className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{v.name}</div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{v.capacity}</span>
                          <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{v.luggage}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-medium text-white">${priceBreakdown(s.tripType, v, { durationHours: s.durationHours, distanceKm: s.distanceKm ?? undefined, tariff: pearsonTariff }, pricingConfig).total.toFixed(0)}</div>
                        <div className="text-xs text-white/50">{s.tripType === "hourly" ? `incl. HST · ${Math.max(HOURLY_MIN_HOURS, s.durationHours)}h` : "CAD incl. HST"}</div>
                      </div>
                      {s.vehicleId === v.id && (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold">
                          <Check className="h-3 w-3 text-night" />
                        </div>
                      )}
                    </label>
                  ))}
                </div>
                <Nav onBack={() => setStep(2)} onNext={() => s.vehicleId ? setStep(4) : toast.error("Choose a vehicle")} />
              </Step>
            )}

            {/* Step 4 — Passenger */}
            {step === 4 && (
              <Step title="Passenger details">
                <Field label="Passenger name">
                  <input className={inputCls} value={s.passengerName} onChange={(e) => setS({ ...s, passengerName: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <input className={inputCls} value={s.passengerPhone} onChange={(e) => setS({ ...s, passengerPhone: e.target.value })} placeholder="+1 (416) …" />
                </Field>
                {/* The airport tariff charges a once-per-trip surcharge for more
                    than 4 passengers and/or excess baggage. It was implemented
                    and priced, but this form never asked — so passenger_count
                    reached the DB as null and the surcharge could never fire. */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Passengers">
                    <input
                      type="number"
                      min={1}
                      max={selected?.capacity ?? 8}
                      className={inputCls}
                      value={s.passengers}
                      onChange={(e) => setS({ ...s, passengers: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </Field>
                  <Field label="Bags">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      className={inputCls}
                      value={s.luggage}
                      onChange={(e) => setS({ ...s, luggage: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </Field>
                </div>
                {selected && s.passengers > selected.capacity && (
                  <p className="-mt-1 text-xs text-amber-400">
                    {selected.name} seats {selected.capacity}. Pick a larger vehicle or reduce the party.
                  </p>
                )}
                <Field label="Special requests (optional)">
                  <textarea rows={3} className={inputCls} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} />
                </Field>
                <Nav onBack={() => setStep(3)} onNext={() =>
                    !s.passengerName || !s.passengerPhone
                      ? toast.error("Please add a name and phone")
                      : selected && s.passengers > selected.capacity
                        ? toast.error(`${selected.name} seats ${selected.capacity}`)
                        : setStep(5)
                  } />
              </Step>
            )}

            {/* Step 5 — Payment */}
            {step === 5 && (
              <Step title="Review & confirm">
                <div className="space-y-3">
                  <div className="rounded-sm bg-white/5 p-5 text-sm">
                    {([
                      ["Trip type", tripTypeLabel(s.tripType)],
                      ["Pickup", s.pickup],
                      ...(s.tripType !== "hourly"
                        ? s.stops
                            .filter(isFilledStop)
                            .map((st, i) => [`Stop ${i + 1}`, st.address] as [string, string])
                        : []),
                      ...(s.tripType === "hourly"
                        ? [["Duration", `${Math.max(HOURLY_MIN_HOURS, s.durationHours)} hours`] as [string, string]]
                        : [["Drop-off", s.dropoff] as [string, string]]),
                      ...(s.tripType === "airport" && s.flightNumber
                        ? [["Flight", s.flightNumber] as [string, string]]
                        : []),
                      ["Date & Time", formatDateTime(s.datetime)],
                      ["Vehicle", selected?.name ?? "—"],
                      ["Passenger", s.passengerName],
                      ["Fare", `$${(bd.baseFare + bd.markup).toFixed(2)}`],
                      ...(bd.airportFee > 0
                        ? [["Airport fee", `$${bd.airportFee.toFixed(2)}`] as [string, string]]
                        : []),
                      ["HST (13%)", `$${bd.hst.toFixed(2)}`],
                      ["Estimated total", `$${bd.total.toFixed(2)} CAD`],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className={`flex justify-between py-2.5 ${k !== "Estimated total" ? "border-b border-white/10" : "font-medium text-white"}`}>
                        <span className="text-white/60">{k}</span>
                        <span className="text-right text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 rounded-sm bg-white/5 p-4 text-sm text-white/70">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span>Once dispatch confirms your reservation, you&apos;ll receive a secure payment link to complete your booking online.</span>
                  </div>
                  {pearsonTariff != null ? (
                    <p className="text-xs text-white/50">
                      Priced from the official Toronto Pearson airport tariff, with the airport fee and {(pricingConfig.hstRate * 100).toFixed(0)}% HST shown separately above. Highway 407 tolls at cost, requested stops ${pricingConfig.stopWaitPer10Min} per 10 minutes, and a ${pricingConfig.extraPassengerSurcharge} surcharge for more than 4 passengers or excess baggage may apply.
                    </p>
                  ) : (
                    <p className="text-xs text-white/50">
                      The total above includes 13% HST. Highway tolls (incl. 407), parking, waiting time beyond the complimentary period and additional stops are extra where applicable. Gratuity is added at payment.
                    </p>
                  )}
                </div>
                {!user && (
                  <p className="mt-4 text-xs text-white/60">
                    You&apos;ll be asked to sign in to confirm — your quote is saved and you&apos;ll return right here.
                  </p>
                )}
                <Nav
                  onBack={() => setStep(4)}
                  onNext={user ? confirm : signInToConfirm}
                  nextLabel={user ? (confirming ? "Confirming…" : "Confirm Booking") : "Sign in to confirm"}
                  busy={confirming}
                />
              </Step>
            )}

            {/* Step 6 — Confirmed */}
            {step === 6 && reference && (
              <Step title="">
                {/* Success mark */}
                <div className="text-center">
                  <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-gold/20 animate-pulse-ring" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft to-gold shadow-lg">
                      <Check className="h-8 w-8 text-night" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-gold-soft">Reservation confirmed</div>
                  <h2 className="mt-2 text-3xl font-light text-white">
                    You&apos;re all set{s.passengerName ? `, ${s.passengerName.split(" ")[0]}` : ""}.
                  </h2>
                  <p className="mt-2 text-sm text-white/70">A SophRia coordinator will confirm your chauffeur shortly.</p>
                </div>

                {/* Boarding-pass style ticket */}
                <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-night text-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
                  {/* Route map */}
                  {s.tripType !== "hourly" && s.pickupCoords && s.dropoffCoords && (
                    <RideMap
                      pickup={s.pickup}
                      dropoff={s.dropoff}
                      pickupCoords={s.pickupCoords}
                      dropoffCoords={s.dropoffCoords}
                      stops={s.stops}
                      height={180}
                      className="!rounded-none !border-x-0 !border-t-0 !border-b !border-white/10"
                    />
                  )}

                  {/* Reference band */}
                  <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Booking reference</div>
                      <div className="font-display text-2xl tracking-wide text-gold-soft">{reference}</div>
                    </div>
                    <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-soft">
                      {tripTypeLabel(s.tripType)}
                    </span>
                  </div>

                  {/* Pickup code */}
                  {otp && (
                    <div className="flex items-center justify-between border-b border-white/10 bg-night-panel px-6 py-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Pickup code</div>
                        <div className="mt-0.5 text-xs text-white/60">Share with your driver to start the ride</div>
                      </div>
                      <div className="font-mono text-2xl tracking-[0.3em] text-gold-soft">{otp}</div>
                    </div>
                  )}

                  {/* Vehicle showcase */}
                  {selected && (
                    <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
                        <Image
                          src={VEHICLE_IMAGES[selected.type] ?? VEHICLE_IMAGES.sedan}
                          alt={selected.name}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Your vehicle</div>
                        <div className="text-lg">{selected.name}</div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-white/55">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{selected.capacity}</span>
                          <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{selected.luggage}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Route */}
                  <div className="space-y-3 border-b border-white/10 px-6 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pickup</div>
                        <div className="truncate text-sm">{s.pickup || "—"}</div>
                      </div>
                    </div>
                    {s.tripType !== "hourly" && (
                      <div className="flex items-start gap-3">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Drop-off</div>
                          <div className="truncate text-sm">{s.dropoff || "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-px bg-white/10">
                    <div className="bg-night px-6 py-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Date &amp; time</div>
                      <div className="mt-1 text-sm">
                        {formatDateTime(s.datetime)}
                      </div>
                    </div>
                    <div className="bg-night px-6 py-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                        {s.tripType === "hourly" ? "Duration" : "Distance"}
                      </div>
                      <div className="mt-1 text-sm">
                        {s.tripType === "hourly"
                          ? `${Math.max(HOURLY_MIN_HOURS, s.durationHours)} hours`
                          : s.distanceKm != null
                          ? `${s.distanceKm.toFixed(1)} km${s.durationMin != null ? ` · ${Math.round(s.durationMin)} min` : ""}`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Fare */}
                  <div className="flex items-center justify-between bg-night-panel px-6 py-4">
                    <span className="text-sm text-white/60">Estimated fare</span>
                    <span className="font-display text-2xl text-gold-soft">${fare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={downloadReceipt}
                    className="group inline-flex flex-1 items-center justify-center gap-2 rounded-sm border border-white/25 py-3 text-sm font-medium text-white transition hover:border-gold hover:text-gold-soft"
                  >
                    <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                    Download receipt
                  </button>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm bg-white py-3 text-sm font-medium text-black transition hover:bg-gold-soft"
                  >
                    View My Bookings
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </Step>
            )}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <h2 className="mb-6 font-display text-2xl text-white">{title}</h2>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">{label}</label>
      {children}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = "Continue", busy = false }: { onBack?: () => void; onNext: () => void; nextLabel?: string; busy?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
      {onBack ? (
        <button onClick={onBack} disabled={busy} className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/60 transition hover:text-white disabled:opacity-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : <div />}
      <button
        onClick={onNext}
        disabled={busy}
        className="inline-flex cursor-pointer items-center gap-2 rounded-sm bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-gold-soft disabled:opacity-60"
      >
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
