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
import { Check, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import Image from "next/image";
import { createBookingAction } from "@/lib/actions";

type State = {
  pickup: string;
  dropoff: string;
  datetime: string;
  vehicleId: string | null;
  fare: number;
  passengerName: string;
  passengerPhone: string;
  notes: string;
};

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
    pickup: "",
    dropoff: "",
    datetime: "",
    vehicleId: null,
    fare: 0,
    passengerName: "",
    passengerPhone: "",
    notes: "",
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-book"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("is_active", true).order("base_rate");
      if (error) throw error;
      return data;
    },
  });

  // Pre-populate passenger name and phone from user profile
  useEffect(() => {
    if (user) {
      setS(prev => ({
        ...prev,
        passengerName: prev.passengerName || user.user_metadata?.full_name || "",
        passengerPhone: prev.passengerPhone || user.phone || "",
      }));
    }
  }, [user]);

  // Parse query parameters from Homepage widget
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      try {
        const decodedQ = decodeURIComponent(q);
        const params = new URLSearchParams(decodedQ);
        const pickupVal = params.get("pickup") || "";
        const dropoffVal = params.get("dropoff") || "";
        const datetimeVal = params.get("datetime") || "";
        const vehicleType = params.get("vehicle") || "";

        setS(prev => {
          const nextState = {
            ...prev,
            pickup: pickupVal,
            dropoff: dropoffVal,
            datetime: datetimeVal,
          };

          if (vehicles && vehicleType) {
            const matchedVehicle = vehicles.find((v: any) => v.type === vehicleType);
            if (matchedVehicle) {
              nextState.vehicleId = matchedVehicle.id;
              nextState.fare = Number(matchedVehicle.base_rate);
            }
          }
          return nextState;
        });
      } catch (err) {
        console.error("Error parsing booking query params:", err);
      }
    }
  }, [searchParams, vehicles]);

  const selected = vehicles?.find((v: any) => v.id === s.vehicleId);

  const confirm = async () => {
    if (!user || !s.vehicleId) return;
    try {
      const data = await createBookingAction({
        vehicleId: s.vehicleId,
        pickup: s.pickup,
        dropoff: s.dropoff,
        datetime: s.datetime,
        fare: s.fare,
        passengerName: s.passengerName,
        passengerPhone: s.passengerPhone,
        notes: s.notes,
      });
      setReference(data.reference);
      setStep(6);
    } catch (err: any) {
      toast.error(err.message || "Failed to create booking");
    }
  };

  return (
    <SiteLayout>
      <section className="px-6 pb-24 pt-24 bg-background">
        <div className="mx-auto max-w-3xl">
          <div className="eyebrow mb-6">Reserve</div>
          <h1 className="text-4xl md:text-5xl font-light">Book your ride.</h1>

          {/* Progress */}
          <div className="mt-10 flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-foreground" : "bg-border"}`} />
            ))}
          </div>
          <div className="mt-3 text-xs text-ink-soft">Step {Math.min(step, 6)} of 6</div>

          <div className="mt-10 rounded-sm border border-border bg-card p-8">
            {step === 1 && (
              <Step title="Pickup & Drop-off">
                <Field label="Pickup location">
                  <input
                    className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                    value={s.pickup}
                    onChange={(e) => setS({ ...s, pickup: e.target.value })}
                    placeholder="123 Bay St, Toronto"
                    required
                  />
                </Field>
                <Field label="Drop-off location">
                  <input
                    className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                    value={s.dropoff}
                    onChange={(e) => setS({ ...s, dropoff: e.target.value })}
                    placeholder="Toronto Pearson (YYZ)"
                    required
                  />
                </Field>
                <Nav onNext={() => s.pickup && s.dropoff ? setStep(2) : toast.error("Please fill both fields")} />
              </Step>
            )}

            {step === 2 && (
              <Step title="Date & Time">
                <Field label="Pickup date & time">
                  <input
                    type="datetime-local"
                    className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                    value={s.datetime}
                    onChange={(e) => setS({ ...s, datetime: e.target.value })}
                    required
                  />
                </Field>
                <Nav onBack={() => setStep(1)} onNext={() => s.datetime ? setStep(3) : toast.error("Pick a date and time")} />
              </Step>
            )}

            {step === 3 && (
              <Step title="Vehicle & estimate">
                <div className="space-y-3">
                  {vehicles?.map((v: any) => (
                    <label key={v.id} className={`flex cursor-pointer items-center gap-4 rounded-sm border p-4 transition ${s.vehicleId === v.id ? "border-foreground bg-background" : "border-border bg-card"}`}>
                      <input type="radio" name="v" checked={s.vehicleId === v.id} onChange={() => setS({ ...s, vehicleId: v.id, fare: Number(v.base_rate) })} className="sr-only" />
                      <div className="h-16 w-24 rounded-sm relative overflow-hidden bg-black flex-shrink-0">
                        <Image
                          src={VEHICLE_IMAGES[v.type] ?? VEHICLE_IMAGES.sedan}
                          alt={v.name}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-base text-foreground font-light">{v.name}</div>
                        <div className="text-xs text-ink-soft">{v.capacity} guests · {v.luggage} bags</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg text-foreground">${Number(v.base_rate).toFixed(0)}</div>
                        <div className="text-xs text-ink-soft">CAD est.</div>
                      </div>
                    </label>
                  ))}
                </div>
                <Nav onBack={() => setStep(2)} onNext={() => s.vehicleId ? setStep(4) : toast.error("Choose a vehicle")} />
              </Step>
            )}

            {step === 4 && (
              <Step title="Passenger details">
                <Field label="Passenger name">
                  <input
                    className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                    value={s.passengerName}
                    onChange={(e) => setS({ ...s, passengerName: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                    value={s.passengerPhone}
                    onChange={(e) => setS({ ...s, passengerPhone: e.target.value })}
                    placeholder="+1 (416) …"
                    required
                  />
                </Field>
                <Field label="Special requests">
                  <textarea
                    rows={3}
                    className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                    value={s.notes}
                    onChange={(e) => setS({ ...s, notes: e.target.value })}
                  />
                </Field>
                <Nav onBack={() => setStep(3)} onNext={() => s.passengerName && s.passengerPhone ? setStep(5) : toast.error("Please add a name and phone")} />
              </Step>
            )}

            {step === 5 && (
              <Step title="Payment">
                <div className="space-y-4">
                  <div className="rounded-sm border border-border bg-background p-5 text-sm">
                    <div className="flex justify-between"><span className="text-ink-muted">Vehicle</span><span className="text-foreground">{selected?.name}</span></div>
                    <div className="mt-2 flex justify-between"><span className="text-ink-muted">Estimate</span><span className="text-foreground">${s.fare.toFixed(2)} CAD</span></div>
                  </div>
                  <div className="rounded-sm border border-border bg-background p-5 text-sm text-ink-muted">
                    <div className="mb-2 flex items-center gap-2 text-foreground"><Sparkles className="h-4 w-4" /> Stripe payment coming soon</div>
                    Your booking will be confirmed and your card charged once Stripe is enabled on this site. For now, you can complete the reservation and we'll contact you to finalize payment.
                  </div>
                </div>
                <Nav onBack={() => setStep(4)} onNext={confirm} nextLabel="Confirm Booking" />
              </Step>
            )}

            {step === 6 && reference && (
              <Step title="Reservation confirmed">
                <div className="rounded-sm border border-border bg-background p-8 text-center">
                  <Check className="mx-auto h-10 w-10 text-foreground" />
                  <div className="mt-4 eyebrow">Booking reference</div>
                  <div className="mt-2 font-display text-4xl text-foreground">{reference}</div>
                  <div className="mt-4 text-sm text-ink-muted">A SophRia coordinator will confirm shortly.</div>
                  <div className="mt-6 inline-flex rounded-sm border border-border px-3 py-1 text-xs text-ink-muted">Live tracking coming soon</div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => router.push("/dashboard")} className="flex-1 rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] cursor-pointer">
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
      <h2 className="mb-6 text-2xl font-light text-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = "Continue" }: { onBack?: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="mt-8 flex justify-between border-t border-border pt-6">
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-foreground cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : <div />}
      <button onClick={onNext} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] cursor-pointer">
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
