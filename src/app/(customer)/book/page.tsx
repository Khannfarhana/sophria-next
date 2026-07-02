"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { VEHICLE_IMAGES } from "@/lib/vehicles";
import { Check, ArrowRight, ArrowLeft, Sparkles, Users, Luggage, Download } from "lucide-react";
import Image from "next/image";
import { createBookingAction } from "@/lib/actions";
import { TripTypeToggle } from "@/components/site/TripTypeToggle";
import { AddressAutocomplete } from "@/components/site/AddressAutocomplete";
import { RideMap } from "@/components/site/RideMap";
import { getDirections, type Place } from "@/lib/mapbox";
import { quote, tripTypeLabel, HOURLY_MIN_HOURS, type TripType } from "@/lib/pricing";
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
  distanceKm: number | null;
  durationMin: number | null;
  datetime: string;
  durationHours: number;
  flightNumber: string;
  vehicleId: string | null;
  passengerName: string;
  passengerPhone: string;
  notes: string;
};

const STEP_LABELS = ["Trip", "Date & Time", "Vehicle", "Passenger", "Payment", "Confirmed"];

export default function BookPage() {
  return (
    <ProtectedRoute>
      <BookFlow />
    </ProtectedRoute>
  );
}

function BookFlow() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useSupabase();

  const [step, setStep] = useState(1);
  const [reference, setReference] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [s, setS] = useState<State>({
    tripType: "one_way", pickup: "", dropoff: "",
    pickupCoords: null, dropoffCoords: null, distanceKm: null, durationMin: null,
    datetime: "", durationHours: HOURLY_MIN_HOURS, flightNumber: "", vehicleId: null,
    passengerName: "", passengerPhone: "", notes: "",
  });

  const { data: vehicles } = useQuery<BookVehicle[]>({
    queryKey: ["vehicles-book"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockDb.activeVehicles();
      const { data, error } = await supabase.from("vehicles").select("*").eq("is_active", true).order("base_rate");
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
          passengerPhone: "",
        }));
      });
    }
  }, [user]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      try {
        const params = new URLSearchParams(decodeURIComponent(q));
        Promise.resolve().then(() => {
          setS(prev => {
            const tt = (params.get("tripType") as TripType) || prev.tripType;
            const num = (k: string) => (params.get(k) != null ? Number(params.get(k)) : null);
            const pLng = num("pickupLng"), pLat = num("pickupLat");
            const dLng = num("dropoffLng"), dLat = num("dropoffLat");
            const next = {
              ...prev,
              tripType: ["one_way", "hourly", "airport"].includes(tt) ? tt : prev.tripType,
              pickup: params.get("pickup") || "",
              dropoff: params.get("dropoff") || "",
              pickupCoords: pLng != null && pLat != null ? { lng: pLng, lat: pLat } : null,
              dropoffCoords: dLng != null && dLat != null ? { lng: dLng, lat: dLat } : null,
              datetime: params.get("datetime") || "",
              durationHours: Number(params.get("duration")) || prev.durationHours,
              flightNumber: params.get("flight") || "",
            };
            const vehicleType = params.get("vehicle") || "";
            if (vehicles && vehicleType) {
              const match = vehicles.find((v) => v.type === vehicleType);
              if (match) next.vehicleId = match.id;
            }
            return next;
          });
        });
      } catch (err) { console.error(err); }
    }
  }, [searchParams, vehicles]);

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
    getDirections(p, d).then((dir) => {
      if (cancelled || !dir) return;
      setS((prev) => ({ ...prev, distanceKm: dir.distanceKm, durationMin: dir.durationMin }));
    });
    return () => { cancelled = true; };
  }, [s.pickupCoords, s.dropoffCoords, s.tripType]);

  const selected = vehicles?.find((v) => v.id === s.vehicleId);
  const fare = quote(s.tripType, selected, { durationHours: s.durationHours, distanceKm: s.distanceKm ?? undefined });

  const confirm = async () => {
    if (!user || !s.vehicleId) return;
    try {
      const payload = {
        vehicleId: s.vehicleId, pickup: s.pickup, dropoff: s.dropoff,
        datetime: s.datetime, fare, passengerName: s.passengerName,
        passengerPhone: s.passengerPhone, notes: s.notes,
        tripType: s.tripType,
        durationHours: s.tripType === "hourly" ? s.durationHours : null,
        flightNumber: s.tripType === "airport" ? (s.flightNumber || null) : null,
        pickupLat: s.pickupCoords?.lat ?? null,
        pickupLng: s.pickupCoords?.lng ?? null,
        dropoffLat: s.dropoffCoords?.lat ?? null,
        dropoffLng: s.dropoffCoords?.lng ?? null,
        distanceKm: s.distanceKm,
        durationMin: s.durationMin,
      };
      const data = SUPABASE_ENABLED
        ? await createBookingAction(payload)
        : await mockCreateBooking({ ...payload, customerId: user.id });
      setReference(data.reference);
      setOtp(data.start_otp ?? null);
      setStep(6);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create booking");
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
      ? new Date(s.datetime).toLocaleString("en-CA", { dateStyle: "full", timeStyle: "short" })
      : "—";
    const rows: [string, string][] = [
      ["Trip type", tripTypeLabel(s.tripType)],
      ["Pickup", s.pickup],
      ...(s.tripType === "hourly"
        ? ([["Duration", `${Math.max(HOURLY_MIN_HOURS, s.durationHours)} hours`]] as [string, string][])
        : ([["Drop-off", s.dropoff]] as [string, string][])),
      ...(s.distanceKm != null ? ([["Distance", `${s.distanceKm.toFixed(1)} km`]] as [string, string][]) : []),
      ...(s.durationMin != null ? ([["Est. drive time", `${Math.round(s.durationMin)} min`]] as [string, string][]) : []),
      ...(s.tripType === "airport" && s.flightNumber ? ([["Flight", s.flightNumber]] as [string, string][]) : []),
      ["Date & time", dt],
      ["Vehicle", selected?.name ?? "—"],
      ["Passenger", s.passengerName],
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
    <div class="total"><div class="lbl">Estimated fare</div><div class="amt">$${fare.toFixed(2)} CAD</div></div>
    <div class="foot">This is an estimate, not a paid invoice. A SophRia coordinator will confirm your reservation and finalize payment. Thank you for choosing SophRia — Toronto's premier chauffeur service.</div>
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

  const inputCls = "w-full rounded-xl border bg-input px-4 py-3 text-sm text-foreground transition focus:border-foreground focus:outline-none";

  return (
    <SiteLayout>
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-16 pt-36 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">Reserve</div>
          <h1 className="text-4xl font-light leading-[1.05] md:text-5xl">
            Book your <span className="text-[#e7d3a8]">ride.</span>
          </h1>
        </div>
      </section>

      <section className="bg-background px-6 py-16">
        <div className="mx-auto max-w-3xl">

          {/* Step indicator */}
          <div className="mb-8">
            <div className="flex items-center gap-1.5">
              {[1,2,3,4,5,6].map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${n <= step ? "bg-foreground" : "bg-border"}`}
                />
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-xs text-ink-soft">Step {Math.min(step, 6)} of 6</span>
              <span className="text-xs font-medium text-ink-muted">{STEP_LABELS[Math.min(step, 6) - 1]}</span>
            </div>
          </div>

          {/* Step card */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">

            {/* Step 1 — Trip details */}
            {step === 1 && (
              <Step title="Trip details">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-ink-muted">Trip type</label>
                  <TripTypeToggle value={s.tripType} onChange={(t) => setS({ ...s, tripType: t })} />
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
                      height={220}
                    />
                    {s.distanceKm != null && (
                      <p className="text-sm text-ink-muted">
                        Approx. <span className="font-medium text-foreground">{s.distanceKm.toFixed(1)} km</span>
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
                  <input type="datetime-local" className={inputCls} value={s.datetime} onChange={(e) => setS({ ...s, datetime: e.target.value })} />
                </Field>
                <Nav onBack={() => setStep(1)} onNext={() => s.datetime ? setStep(3) : toast.error("Pick a date and time")} />
              </Step>
            )}

            {/* Step 3 — Choose vehicle */}
            {step === 3 && (
              <Step title="Choose your vehicle">
                <div className="space-y-3">
                  {vehicles?.map((v) => (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all ${
                        s.vehicleId === v.id
                          ? "border-foreground bg-surface shadow-sm"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <input type="radio" name="v" checked={s.vehicleId === v.id} onChange={() => setS({ ...s, vehicleId: v.id })} className="sr-only" />
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                        <Image src={VEHICLE_IMAGES[v.type] ?? VEHICLE_IMAGES.sedan} alt={v.name} fill sizes="96px" className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{v.name}</div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-ink-soft">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{v.capacity}</span>
                          <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{v.luggage}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-medium text-foreground">${quote(s.tripType, v, { durationHours: s.durationHours, distanceKm: s.distanceKm ?? undefined }).toFixed(0)}</div>
                        <div className="text-xs text-ink-soft">{s.tripType === "hourly" ? `CAD · ${Math.max(HOURLY_MIN_HOURS, s.durationHours)}h` : "CAD est."}</div>
                      </div>
                      {s.vehicleId === v.id && (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground">
                          <Check className="h-3 w-3 text-background" />
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
                <Field label="Special requests (optional)">
                  <textarea rows={3} className={inputCls} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} />
                </Field>
                <Nav onBack={() => setStep(3)} onNext={() => s.passengerName && s.passengerPhone ? setStep(5) : toast.error("Please add a name and phone")} />
              </Step>
            )}

            {/* Step 5 — Payment */}
            {step === 5 && (
              <Step title="Review & confirm">
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-surface p-5 text-sm">
                    {([
                      ["Trip type", tripTypeLabel(s.tripType)],
                      ["Pickup", s.pickup],
                      ...(s.tripType === "hourly"
                        ? [["Duration", `${Math.max(HOURLY_MIN_HOURS, s.durationHours)} hours`] as [string, string]]
                        : [["Drop-off", s.dropoff] as [string, string]]),
                      ...(s.tripType === "airport" && s.flightNumber
                        ? [["Flight", s.flightNumber] as [string, string]]
                        : []),
                      ["Date & Time", s.datetime ? new Date(s.datetime).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"],
                      ["Vehicle", selected?.name ?? "—"],
                      ["Passenger", s.passengerName],
                      ["Estimated fare", `$${fare.toFixed(2)} CAD`],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className={`flex justify-between py-2.5 ${k !== "Estimated fare" ? "border-b border-border" : "font-medium text-foreground"}`}>
                        <span className="text-ink-muted">{k}</span>
                        <span className="text-right text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>Stripe payment coming soon. Complete your reservation and we&apos;ll contact you to finalize payment.</span>
                  </div>
                </div>
                <Nav onBack={() => setStep(4)} onNext={confirm} nextLabel="Confirm Booking" />
              </Step>
            )}

            {/* Step 6 — Confirmed */}
            {step === 6 && reference && (
              <Step title="">
                {/* Success mark */}
                <div className="text-center">
                  <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-[#c9a76a]/20 animate-pulse-ring" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#e7d3a8] to-[#c9a76a] shadow-lg">
                      <Check className="h-8 w-8 text-[#0d0d0e]" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[#b08d4c]">Reservation confirmed</div>
                  <h2 className="mt-2 text-3xl font-light text-foreground">
                    You&apos;re all set{s.passengerName ? `, ${s.passengerName.split(" ")[0]}` : ""}.
                  </h2>
                  <p className="mt-2 text-sm text-ink-muted">A SophRia coordinator will confirm your chauffeur shortly.</p>
                </div>

                {/* Boarding-pass style ticket */}
                <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0e] text-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
                  {/* Route map */}
                  {s.tripType !== "hourly" && s.pickupCoords && s.dropoffCoords && (
                    <RideMap
                      pickup={s.pickup}
                      dropoff={s.dropoff}
                      pickupCoords={s.pickupCoords}
                      dropoffCoords={s.dropoffCoords}
                      height={180}
                      className="!rounded-none !border-x-0 !border-t-0 !border-b !border-white/10"
                    />
                  )}

                  {/* Reference band */}
                  <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Booking reference</div>
                      <div className="font-display text-2xl tracking-wide text-[#e7d3a8]">{reference}</div>
                    </div>
                    <span className="rounded-full border border-[#c9a76a]/40 bg-[#c9a76a]/10 px-3 py-1 text-xs text-[#e7d3a8]">
                      {tripTypeLabel(s.tripType)}
                    </span>
                  </div>

                  {/* Pickup code */}
                  {otp && (
                    <div className="flex items-center justify-between border-b border-white/10 bg-[#141416] px-6 py-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Pickup code</div>
                        <div className="mt-0.5 text-xs text-white/60">Share with your driver to start the ride</div>
                      </div>
                      <div className="font-mono text-2xl tracking-[0.3em] text-[#e7d3a8]">{otp}</div>
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
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pickup</div>
                        <div className="truncate text-sm">{s.pickup || "—"}</div>
                      </div>
                    </div>
                    {s.tripType !== "hourly" && (
                      <div className="flex items-start gap-3">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c9a76a]" />
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Drop-off</div>
                          <div className="truncate text-sm">{s.dropoff || "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-px bg-white/10">
                    <div className="bg-[#0d0d0e] px-6 py-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Date &amp; time</div>
                      <div className="mt-1 text-sm">
                        {s.datetime ? new Date(s.datetime).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </div>
                    </div>
                    <div className="bg-[#0d0d0e] px-6 py-4">
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
                  <div className="flex items-center justify-between bg-[#141416] px-6 py-4">
                    <span className="text-sm text-white/60">Estimated fare</span>
                    <span className="font-display text-2xl text-[#e7d3a8]">${fare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={downloadReceipt}
                    className="group inline-flex flex-1 items-center justify-center gap-2 rounded-sm border border-border py-3 text-sm font-medium text-foreground transition hover:border-foreground/40 hover:bg-muted"
                  >
                    <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                    Download receipt
                  </button>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]"
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
      {title && <h2 className="mb-6 text-xl font-light text-foreground">{title}</h2>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = "Continue" }: { onBack?: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
      {onBack ? (
        <button onClick={onBack} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : <div />}
      <button
        onClick={onNext}
        className="inline-flex cursor-pointer items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]"
      >
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
