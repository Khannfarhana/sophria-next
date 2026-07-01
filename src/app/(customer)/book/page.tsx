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
import { Check, ArrowRight, ArrowLeft, Sparkles, Users, Luggage } from "lucide-react";
import Image from "next/image";
import { createBookingAction } from "@/lib/actions";
import { TripTypeToggle } from "@/components/site/TripTypeToggle";
import { quote, tripTypeLabel, HOURLY_MIN_HOURS, type TripType } from "@/lib/pricing";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { queries as mockDb } from "@/data/data";
import { mockCreateBooking } from "@/lib/mock-db/actions";

type State = {
  tripType: TripType;
  pickup: string;
  dropoff: string;
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
  const [s, setS] = useState<State>({
    tripType: "one_way", pickup: "", dropoff: "", datetime: "",
    durationHours: HOURLY_MIN_HOURS, flightNumber: "", vehicleId: null,
    passengerName: "", passengerPhone: "", notes: "",
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-book"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockDb.activeVehicles();
      const { data, error } = await supabase.from("vehicles").select("*").eq("is_active", true).order("base_rate");
      if (error) throw error;
      return data?.length ? data : mockDb.activeVehicles();
    },
  });

  useEffect(() => {
    if (user) {
      setS(prev => ({
        ...prev,
        passengerName: prev.passengerName || user.user_metadata?.full_name || "",
        passengerPhone: prev.passengerPhone || user.phone || "",
      }));
    }
  }, [user]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      try {
        const params = new URLSearchParams(decodeURIComponent(q));
        setS(prev => {
          const tt = (params.get("tripType") as TripType) || prev.tripType;
          const next = {
            ...prev,
            tripType: ["one_way", "hourly", "airport"].includes(tt) ? tt : prev.tripType,
            pickup: params.get("pickup") || "",
            dropoff: params.get("dropoff") || "",
            datetime: params.get("datetime") || "",
            durationHours: Number(params.get("duration")) || prev.durationHours,
            flightNumber: params.get("flight") || "",
          };
          const vehicleType = params.get("vehicle") || "";
          if (vehicles && vehicleType) {
            const match = vehicles.find((v: any) => v.type === vehicleType);
            if (match) next.vehicleId = match.id;
          }
          return next;
        });
      } catch (err) { console.error(err); }
    }
  }, [searchParams, vehicles]);

  const selected = vehicles?.find((v: any) => v.id === s.vehicleId);
  const fare = quote(s.tripType, selected, { durationHours: s.durationHours });

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
      };
      const data = SUPABASE_ENABLED
        ? await createBookingAction(payload)
        : await mockCreateBooking({ ...payload, customerId: user.id });
      setReference(data.reference);
      setStep(6);
    } catch (err: any) {
      toast.error(err.message || "Failed to create booking");
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
                  <input className={inputCls} value={s.pickup} onChange={(e) => setS({ ...s, pickup: e.target.value })} placeholder="123 Bay St, Toronto" />
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
                    <input className={inputCls} value={s.dropoff} onChange={(e) => setS({ ...s, dropoff: e.target.value })} placeholder="Toronto Pearson (YYZ)" />
                  </Field>
                )}
                {s.tripType === "airport" && (
                  <Field label="Flight number (optional)">
                    <input className={inputCls} value={s.flightNumber} onChange={(e) => setS({ ...s, flightNumber: e.target.value })} placeholder="AC 118" />
                  </Field>
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

            {/* Step 3 — Vehicle */}
            {step === 3 && (
              <Step title="Choose your vehicle">
                <div className="space-y-3">
                  {vehicles?.map((v: any) => (
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
                        <div className="text-base font-medium text-foreground">${quote(s.tripType, v, { durationHours: s.durationHours }).toFixed(0)}</div>
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
                    <span>Stripe payment coming soon. Complete your reservation and we'll contact you to finalize payment.</span>
                  </div>
                </div>
                <Nav onBack={() => setStep(4)} onNext={confirm} nextLabel="Confirm Booking" />
              </Step>
            )}

            {/* Step 6 — Confirmed */}
            {step === 6 && reference && (
              <Step title="">
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
                    <Check className="h-7 w-7 text-background" />
                  </div>
                  <h2 className="mt-6 text-2xl font-light text-foreground">Reservation confirmed</h2>
                  <p className="mt-2 text-sm text-ink-muted">A SophRia coordinator will confirm shortly.</p>
                  <div className="mt-6 inline-block rounded-xl border border-border bg-surface px-6 py-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-ink-muted">Booking reference</div>
                    <div className="mt-1 font-display text-4xl tracking-wide text-foreground">{reference}</div>
                  </div>
                </div>
                <div className="mt-8 border-t border-border pt-6">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="w-full cursor-pointer rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]"
                  >
                    View My Bookings
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
