"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { StatusBadge } from "@/components/site/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RideMap, navigateUrl } from "@/components/site/RideMap";
import { MapPin, Navigation, Play, Check, X, KeyRound, Loader2 } from "lucide-react";
import {
  updateDriverAvailabilityAction,
  acceptRideAction,
  declineRideAction,
  startRideAction,
  completeRideAction,
} from "@/lib/actions";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import {
  mockDriverByUserId,
  mockRidesForDriver,
  mockSetDriverAvailability,
  mockAcceptRide,
  mockDeclineRide,
  mockStartRide,
  mockCompleteRide,
} from "@/lib/mock-db/actions";

export default function DriverPage() {
  return (
    <ProtectedRoute role="driver">
      <DriverPortal />
    </ProtectedRoute>
  );
}

interface DriverRide {
  id: string;
  reference: string;
  customer_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  pickup_location: string;
  dropoff_location: string;
  pickup_datetime: string;
  status: string;
  fare_estimate: number;
  passenger_name: string | null;
  passenger_phone: string | null;
  special_requests: string | null;
  created_at: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  distance_km: number | null;
  duration_min: number | null;
  vehicles?: { name: string | null } | null;
}

function DriverPortal() {
  const { user } = useAuth();
  const supabase = useSupabase();
  const qc = useQueryClient();
  const [available, setAvailable] = useState(false);
  const [openRide, setOpenRide] = useState<DriverRide | null>(null);

  const { data: driver } = useQuery({
    queryKey: ["driver-self", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockDriverByUserId(user!.id);
      const { data } = await supabase.from("drivers").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (driver && driver.is_available !== available) {
      Promise.resolve().then(() => {
        setAvailable(driver.is_available);
      });
    }
  }, [driver, available]);

  const { data: rides } = useQuery({
    queryKey: ["driver-rides", driver?.id],
    enabled: !!driver,
    refetchInterval: 30_000, // new assignments appear without a manual reload
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockRidesForDriver(driver!.id);
      const { data, error } = await supabase
        .from("bookings")
        // Explicit columns — never expose start_otp to the driver's client.
        .select("id, reference, customer_id, driver_id, vehicle_id, pickup_location, dropoff_location, pickup_datetime, status, fare_estimate, passenger_name, passenger_phone, special_requests, created_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, vehicles(name)")
        .eq("driver_id", driver!.id)
        .order("pickup_datetime");
      if (error) throw error;
      return (data ?? []) as unknown as DriverRide[];
    },
  });

  const toggleAvailable = async () => {
    if (!driver) return;
    const next = !available;
    try {
      if (SUPABASE_ENABLED) await updateDriverAvailabilityAction(next);
      else await mockSetDriverAvailability(driver.id, next);
      setAvailable(next);
      toast.success(next ? "● Online" : "○ Offline");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update availability");
    }
  };

  const acceptRide = async (r: DriverRide) => {
    try {
      if (SUPABASE_ENABLED) await acceptRideAction(r.id);
      else await mockAcceptRide(r.id);
      toast.success("Ride accepted");
      qc.invalidateQueries({ queryKey: ["driver-rides"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to accept ride");
    }
  };

  const rejectRide = async (r: DriverRide) => {
    try {
      if (SUPABASE_ENABLED) await declineRideAction(r.id);
      else await mockDeclineRide(r.id);
      toast.success("Ride declined — returned to dispatch");
      qc.invalidateQueries({ queryKey: ["driver-rides"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to decline ride");
    }
  };

  const startRide = async (r: DriverRide, otp: string) => {
    // Errors propagate to the OTP panel, which shows them inline for retry.
    if (SUPABASE_ENABLED) await startRideAction(r.id, otp);
    else await mockStartRide(r.id, otp);
    toast.success("Ride started");
    qc.invalidateQueries({ queryKey: ["driver-rides"] });
    setOpenRide((cur) => cur && { ...cur, status: "in_progress" });
  };

  const completeRide = async (r: DriverRide) => {
    try {
      // Earnings are computed server-side from the DB fare — not sent by us.
      const fare = Number(r.fare_estimate);
      if (SUPABASE_ENABLED) await completeRideAction(r.id);
      else await mockCompleteRide(r.id, fare);
      toast.success(`Ride completed · earned $${(fare * 0.8).toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["driver-rides"] });
      qc.invalidateQueries({ queryKey: ["driver-self"] });
      setOpenRide(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete ride");
    }
  };

  const list = rides ?? [];
  const newRequests = list.filter((r) => r.status === "driver_assigned");
  // "confirmed" kept for rides accepted before the dedicated status existed.
  const upcoming = list.filter((r) => r.status === "accepted" || r.status === "confirmed" || r.status === "in_progress");
  const completed = list.filter((r) => r.status === "completed");

  const now = new Date();
  const today = list.filter((r) => new Date(r.pickup_datetime).toDateString() === now.toDateString());

  return (
    <SiteLayout solidNav>
      <section className="px-6 pb-24 pt-24 bg-background">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="eyebrow mb-3">Driver Portal</div>
              <h1 className="text-4xl md:text-5xl font-light text-foreground">Dashboard</h1>
            </div>
            <button
              onClick={toggleAvailable}
              className={`rounded-sm border px-5 py-2.5 text-sm cursor-pointer transition ${
                available ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-accent"
              }`}
            >
              {available ? "● Online" : "○ Offline"}
            </button>
          </div>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-2 gap-3 md:mt-10 md:grid-cols-4 md:gap-4">
            {[
              { l: "Today's rides", v: today.length },
              { l: "Total earnings", v: `$${Number(driver?.total_earnings ?? 0).toFixed(0)}` },
              { l: "Rating", v: Number(driver?.rating ?? 5).toFixed(2) },
              { l: "Verified", v: driver?.is_verified ? "Yes" : "Pending" },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4 md:p-6">
                <div className="eyebrow text-[10px] md:text-xs">{k.l}</div>
                <div className="mt-2 text-2xl font-light text-foreground md:text-3xl">{k.v}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mt-12">
            <Tabs defaultValue="new">
              <TabsList className="bg-muted text-ink-muted">
                <TabsTrigger value="new" className="cursor-pointer">
                  New Requests {newRequests.length > 0 && <span className="ml-2 rounded-full bg-foreground px-2 text-xs text-background">{newRequests.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="cursor-pointer">
                  Upcoming {upcoming.length > 0 && <span className="ml-2 text-xs text-ink-muted">({upcoming.length})</span>}
                </TabsTrigger>
                <TabsTrigger value="completed" className="cursor-pointer">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="new" className="mt-6">
                <RideList rides={newRequests} empty="No new requests right now.">
                  {(r) => (
                    <>
                      <button onClick={() => acceptRide(r)} className="mr-2 inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs text-background font-medium hover:bg-[#2A2A2A] cursor-pointer">
                        <Check className="h-3 w-3" /> Accept
                      </button>
                      <button onClick={() => rejectRide(r)} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent cursor-pointer">
                        <X className="h-3 w-3" /> Decline
                      </button>
                    </>
                  )}
                </RideList>
              </TabsContent>

              <TabsContent value="upcoming" className="mt-6">
                <RideList rides={upcoming} empty="No upcoming rides.">
                  {(r) => (
                    <button onClick={() => setOpenRide(r)} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent cursor-pointer">
                      Open
                    </button>
                  )}
                </RideList>
              </TabsContent>

              <TabsContent value="completed" className="mt-6">
                <div className="overflow-hidden rounded-md border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-ink-muted">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Route</th>
                          <th className="p-3">Fare</th>
                          <th className="p-3">Earned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completed.map((r) => (
                          <tr key={r.id} className="border-b border-border last:border-0 text-foreground">
                            <td className="p-3">{new Date(r.pickup_datetime).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}</td>
                            <td className="p-3 text-ink-muted">{r.pickup_location} → {r.dropoff_location}</td>
                            <td className="p-3">${Number(r.fare_estimate).toFixed(2)}</td>
                            <td className="p-3 font-medium">${(Number(r.fare_estimate) * 0.8).toFixed(2)}</td>
                          </tr>
                        ))}
                        {completed.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-ink-muted">No completed rides yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {/* Ride detail / Start-Complete dialog */}
      <Dialog open={!!openRide} onOpenChange={(o) => !o && setOpenRide(null)}>
        <DialogContent className="max-w-3xl bg-background border border-border">
          {openRide && <RideDetail ride={openRide} onStart={(otp) => startRide(openRide, otp)} onComplete={() => completeRide(openRide)} />}
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}

function RideList({
  rides,
  empty,
  children,
}: {
  rides: DriverRide[];
  empty: string;
  children: (r: DriverRide) => React.ReactNode;
}) {
  if (rides.length === 0) {
    return <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-ink-muted">{empty}</div>;
  }
  return (
    <div className="space-y-3">
      {rides.map((r) => (
        <div key={r.id} className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-ink-muted">{r.reference}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-2 text-sm text-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{r.pickup_location}</span>
                </div>
                <div className="ml-6 my-1 h-3 border-l border-dashed border-border" />
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="text-ink-muted">{r.dropoff_location}</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-ink-muted">
                {new Date(r.pickup_datetime).toLocaleString("en-CA", { timeZone: "America/Toronto" })} · {r.vehicles?.name ?? "Vehicle TBD"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-foreground">
              <div className="text-lg font-medium">${Number(r.fare_estimate).toFixed(2)}</div>
              <div className="flex">{children(r)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RideDetail({ ride, onStart, onComplete }: { ride: DriverRide; onStart: (otp: string) => Promise<void> | void; onComplete: () => void }) {
  const isInProgress = ride.status === "in_progress";
  // Only pre-ride states can start — never completed/cancelled/rejected rides.
  const startable = ["accepted", "confirmed", "driver_assigned"].includes(ride.status);
  const pickupTime = new Date(ride.pickup_datetime);
  // eslint-disable-next-line react-hooks/purity
  const canStart = startable && Date.now() >= pickupTime.getTime() - 30 * 60_000; // 30 min before pickup
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const submitOtp = async () => {
    if (otp.trim().length < 4) { setOtpError("Enter the 4-digit pickup code."); return; }
    setVerifying(true);
    setOtpError(null);
    try {
      await onStart(otp.trim());
    } catch (err: unknown) {
      // Wrong code / lockout: surface inline and reset for a quick retry.
      setOtpError(err instanceof Error ? err.message : "Failed to start ride");
      setOtp("");
      otpInputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-foreground">Ride {ride.reference}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <RideMap
          pickup={ride.pickup_location}
          dropoff={ride.dropoff_location}
          pickupCoords={ride.pickup_lng != null && ride.pickup_lat != null ? { lng: ride.pickup_lng, lat: ride.pickup_lat } : null}
          dropoffCoords={ride.dropoff_lng != null && ride.dropoff_lat != null ? { lng: ride.dropoff_lng, lat: ride.dropoff_lat } : null}
          height={280}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground">
          <div>
            <div className="text-ink-muted text-xs uppercase tracking-wider">Pickup</div>
            <div>{pickupTime.toLocaleString("en-CA", { timeZone: "America/Toronto" })}</div>
          </div>
          <div className="text-right">
            <div className="text-ink-muted text-xs uppercase tracking-wider">Fare</div>
            <div className="text-lg font-medium">${Number(ride.fare_estimate).toFixed(2)}</div>
          </div>
        </div>
        <div className="text-sm text-foreground">
          <div className="flex gap-2"><MapPin className="h-4 w-4" /><span>{ride.pickup_location}</span></div>
          <div className="ml-6 my-1 h-3 border-l border-dashed border-border" />
          <div className="flex gap-2"><MapPin className="h-4 w-4 text-ink-muted" /><span className="text-ink-muted">{ride.dropoff_location}</span></div>
        </div>
        {ride.special_requests && (
          <div className="rounded-md border border-border bg-muted p-3 text-xs text-ink-muted">
            <span className="font-medium text-foreground">Notes: </span>{ride.special_requests}
          </div>
        )}
      </div>

      {/* OTP entry — driver enters the code the customer gives them */}
      {startable && otpMode && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="h-4 w-4" /> Enter pickup code
            </div>
            <button
              type="button"
              aria-label="Close code entry"
              onClick={() => { setOtpMode(false); setOtp(""); setOtpError(null); }}
              className="text-ink-soft hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Ask the customer for the 4-digit code shown in their booking.</p>
          <div className="mt-3 flex gap-2">
            <input
              ref={otpInputRef}
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 4)); setOtpError(null); }}
              inputMode="numeric"
              autoFocus
              placeholder="0000"
              onKeyDown={(e) => e.key === "Enter" && submitOtp()}
              className={`w-28 rounded-lg border bg-input px-3 py-2 text-center text-lg font-mono tracking-[0.4em] text-foreground focus:outline-none ${
                otpError ? "border-red-400 focus:border-red-500" : "border-border focus:border-foreground"
              }`}
            />
            <button
              onClick={submitOtp}
              disabled={verifying}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[#2A2A2A] disabled:opacity-60"
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Verify &amp; Start
            </button>
          </div>
          {otpError && <p className="mt-2 text-xs font-medium text-red-500">{otpError}</p>}
        </div>
      )}

      <DialogFooter className="gap-2 mt-4">
        <a
          href={navigateUrl(ride.pickup_location, ride.dropoff_location)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background text-foreground px-4 py-2 text-sm hover:bg-accent cursor-pointer"
        >
          <Navigation className="h-4 w-4" /> Navigate
        </a>
        {startable ? (
          <button
            onClick={() => setOtpMode(true)}
            disabled={!canStart || otpMode}
            title={canStart ? undefined : "Available 30 min before pickup"}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[#2A2A2A] disabled:opacity-50 cursor-pointer"
          >
            <KeyRound className="h-4 w-4" /> Start Ride
          </button>
        ) : isInProgress ? (
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[#2A2A2A] cursor-pointer"
          >
            <Check className="h-4 w-4" /> Complete Ride
          </button>
        ) : null}
      </DialogFooter>
    </>
  );
}
