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
import { formatDateTime, formatDate, isPickupToday, minutesUntilPickup } from "@/lib/datetime";
import { parseStops } from "@/lib/stops";
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
  driver_payout: number | null;
  tip: number | null;
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
  /** Ordered intermediate stops — the driver's itinerary for the ride. */
  stops?: unknown;
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
        // Explicit columns — never expose start_otp OR the customer fare to
        // the driver's client; drivers see their payout (driver_payout) only.
        .select("id, reference, customer_id, driver_id, vehicle_id, pickup_location, dropoff_location, pickup_datetime, status, driver_payout, tip, passenger_name, passenger_phone, special_requests, created_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, stops, vehicles(name)")
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
      // Earnings are computed server-side from the payout snapshot — not sent by us.
      const res = SUPABASE_ENABLED ? await completeRideAction(r.id) : await mockCompleteRide(r.id);
      toast.success(
        res.earned != null ? `Ride completed · earned $${Number(res.earned).toFixed(2)}` : "Ride completed",
      );
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
  // The query is ordered by pickup ascending, which is what an operational
  // "next ride up" queue wants. Completed work reads the other way round —
  // newest first — so it gets its own sort rather than showing the driver
  // their oldest-ever ride at the top.
  const upcoming = list.filter((r) => r.status === "accepted" || r.status === "confirmed" || r.status === "in_progress");
  const completed = list
    .filter((r) => r.status === "completed")
    .slice()
    .sort((a, b) => b.pickup_datetime.localeCompare(a.pickup_datetime));

  const today = list.filter((r) => isPickupToday(r.pickup_datetime));

  return (
    <SiteLayout>
      <section className="px-6 pb-24 pt-28 md:pt-32 bg-night text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="eyebrow mb-3 text-white/60">Driver Portal</div>
              <h1 className="text-4xl md:text-5xl font-light text-white">Dashboard</h1>
            </div>
            <button
              onClick={toggleAvailable}
              className={`rounded-sm border px-5 py-2.5 text-sm cursor-pointer transition ${
                available ? "border-white bg-white text-black" : "border-white/25 text-white hover:border-gold hover:text-gold-soft"
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
              <div key={k.l} className="rounded-sm bg-night-card p-4 md:p-6">
                <div className="eyebrow text-[10px] md:text-xs text-white/60">{k.l}</div>
                <div className="mt-2 text-2xl font-light text-white md:text-3xl">{k.v}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mt-12">
            <Tabs defaultValue="new">
              <TabsList className="bg-white/5 text-white/70">
                <TabsTrigger value="new" className="cursor-pointer">
                  New Requests {newRequests.length > 0 && <span className="ml-2 rounded-full bg-white px-2 text-xs text-black">{newRequests.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="cursor-pointer">
                  Upcoming {upcoming.length > 0 && <span className="ml-2 text-xs text-white/70">({upcoming.length})</span>}
                </TabsTrigger>
                <TabsTrigger value="completed" className="cursor-pointer">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="new" className="mt-6">
                <RideList rides={newRequests} empty="No new requests right now.">
                  {(r) => (
                    <>
                      <button onClick={() => acceptRide(r)} className="mr-2 inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs text-black font-medium hover:bg-gold-soft cursor-pointer">
                        <Check className="h-3 w-3" /> Accept
                      </button>
                      <button onClick={() => rejectRide(r)} className="inline-flex items-center gap-1 rounded-md border border-white/25 px-3 py-1.5 text-xs text-white hover:border-gold hover:text-gold-soft cursor-pointer">
                        <X className="h-3 w-3" /> Decline
                      </button>
                    </>
                  )}
                </RideList>
              </TabsContent>

              <TabsContent value="upcoming" className="mt-6">
                <RideList rides={upcoming} empty="No upcoming rides.">
                  {(r) => (
                    <button onClick={() => setOpenRide(r)} className="rounded-md border border-white/25 px-3 py-1.5 text-xs text-white hover:border-gold hover:text-gold-soft cursor-pointer">
                      Open
                    </button>
                  )}
                </RideList>
              </TabsContent>

              <TabsContent value="completed" className="mt-6">
                <div className="overflow-hidden rounded-sm bg-night-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wider text-white/70">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Route</th>
                          <th className="p-3">Earned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completed.map((r) => (
                          <tr key={r.id} className="border-b border-white/10 last:border-0 text-white">
                            <td className="p-3">{formatDate(r.pickup_datetime)}</td>
                            <td className="p-3 text-white/70">{r.pickup_location} → {r.dropoff_location}</td>
                            <td className="p-3 font-medium">
                              {r.driver_payout != null
                                ? `$${(Number(r.driver_payout) + Math.max(0, Number(r.tip ?? 0))).toFixed(2)}`
                                : "—"}
                              {Number(r.tip ?? 0) > 0 && (
                                <span className="ml-1.5 text-xs font-normal text-white/50">incl. ${Number(r.tip).toFixed(2)} tip</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {completed.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-8 text-center text-white/70">No completed rides yet.</td>
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
        <DialogContent className="max-w-3xl bg-night-panel border border-white/10 text-white">
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
    return <div className="rounded-sm bg-night-card p-8 text-center text-sm text-white/70">{empty}</div>;
  }
  return (
    <div className="space-y-3">
      {rides.map((r) => (
        <div key={r.id} className="rounded-sm bg-night-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-white/70">{r.reference}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-2 text-sm text-white">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{r.pickup_location}</span>
                </div>
                <div className="ml-6 my-1 h-3 border-l border-dashed border-white/10" />
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                  <span className="text-white/70">{r.dropoff_location}</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-white/70">
                {formatDateTime(r.pickup_datetime)} · {r.vehicles?.name ?? "Vehicle TBD"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-white">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Your payout</div>
                <div className="text-lg font-medium">
                  {r.driver_payout != null ? `$${Number(r.driver_payout).toFixed(2)}` : "—"}
                </div>
                {Number(r.tip ?? 0) > 0 && (
                  <div className="text-xs font-medium text-gold-soft">+ ${Number(r.tip).toFixed(2)} tip</div>
                )}
              </div>
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
  // Must resolve the true instant: pickup_datetime holds the picked wall clock
  // encoded as UTC ("6pm" -> "18:00Z"), which as a bare instant is 2pm Toronto
  // in summer. Comparing it to Date.now() directly unlocked Start Ride four
  // hours early, letting a driver start (and so bill) a ride before it existed.
  const canStart = startable && minutesUntilPickup(ride.pickup_datetime) <= 30;
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
        <DialogTitle className="text-white">Ride {ride.reference}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <RideMap
          pickup={ride.pickup_location}
          dropoff={ride.dropoff_location}
          pickupCoords={ride.pickup_lng != null && ride.pickup_lat != null ? { lng: ride.pickup_lng, lat: ride.pickup_lat } : null}
          dropoffCoords={ride.dropoff_lng != null && ride.dropoff_lat != null ? { lng: ride.dropoff_lng, lat: ride.dropoff_lat } : null}
          stops={parseStops(ride.stops)}
          height={280}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white">
          <div>
            <div className="text-white/70 text-xs uppercase tracking-wider">Pickup</div>
            <div>{formatDateTime(ride.pickup_datetime)}</div>
          </div>
          <div className="text-right">
            <div className="text-white/70 text-xs uppercase tracking-wider">Your payout</div>
            <div className="text-lg font-medium">
              {ride.driver_payout != null ? `$${Number(ride.driver_payout).toFixed(2)}` : "—"}
            </div>
            {Number(ride.tip ?? 0) > 0 && (
              <div className="text-xs font-medium text-gold-soft">+ ${Number(ride.tip).toFixed(2)} tip</div>
            )}
          </div>
        </div>
        <div className="text-sm text-white">
          <div className="flex gap-2"><MapPin className="h-4 w-4" /><span>{ride.pickup_location}</span></div>
          <div className="ml-6 my-1 h-3 border-l border-dashed border-white/10" />
          <div className="flex gap-2"><MapPin className="h-4 w-4 text-white/70" /><span className="text-white/70">{ride.dropoff_location}</span></div>
        </div>
        {ride.special_requests && (
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <span className="font-medium text-white">Notes: </span>{ride.special_requests}
          </div>
        )}
      </div>

      {/* OTP entry — driver enters the code the customer gives them */}
      {startable && otpMode && (
        <div className="mt-4 rounded-sm border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <KeyRound className="h-4 w-4" /> Enter pickup code
            </div>
            <button
              type="button"
              aria-label="Close code entry"
              onClick={() => { setOtpMode(false); setOtp(""); setOtpError(null); }}
              className="text-white/50 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-white/70">Ask the customer for the 4-digit code shown in their booking.</p>
          <div className="mt-3 flex gap-2">
            <input
              ref={otpInputRef}
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 4)); setOtpError(null); }}
              inputMode="numeric"
              autoFocus
              placeholder="0000"
              onKeyDown={(e) => e.key === "Enter" && submitOtp()}
              className={`w-28 rounded-lg border bg-white/[0.06] px-3 py-2 text-center text-lg font-mono tracking-[0.4em] text-white placeholder:text-white/40 focus:outline-none ${
                otpError ? "border-red-400 focus:border-red-400" : "border-white/15 focus:border-gold"
              }`}
            />
            <button
              onClick={submitOtp}
              disabled={verifying}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gold-soft disabled:opacity-60"
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Verify &amp; Start
            </button>
          </div>
          {otpError && <p className="mt-2 text-xs font-medium text-red-400">{otpError}</p>}
        </div>
      )}

      <DialogFooter className="gap-2 mt-4">
        <a
          href={navigateUrl(ride.pickup_location, ride.dropoff_location)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-md border border-white/25 text-white px-4 py-2 text-sm hover:border-gold hover:text-gold-soft cursor-pointer"
        >
          <Navigation className="h-4 w-4" /> Navigate
        </a>
        {startable ? (
          <button
            onClick={() => setOtpMode(true)}
            disabled={!canStart || otpMode}
            title={canStart ? undefined : "Available 30 min before pickup"}
            className="inline-flex items-center gap-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gold-soft disabled:opacity-50 cursor-pointer"
          >
            <KeyRound className="h-4 w-4" /> Start Ride
          </button>
        ) : isInProgress ? (
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gold-soft cursor-pointer"
          >
            <Check className="h-4 w-4" /> Complete Ride
          </button>
        ) : null}
      </DialogFooter>
    </>
  );
}
