"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { useSupabase } from "@/hooks/use-supabase";
import { StatusBadge } from "@/components/site/StatusBadge";
import { AdminTabs } from "@/components/site/AdminTabs";
import { DriverReviewDialog } from "@/components/site/DriverReviewDialog";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, X, UserPlus, Star, ChevronRight } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { formatDateTime } from "@/lib/datetime";
import type { Database } from "@/integrations/supabase/types";
import {
  verifyDriverAction,
  confirmBookingAction,
  rejectBookingAction,
  assignDriverAction,
} from "@/lib/actions";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import {
  mockAdminBookings,
  mockAdminDrivers,
  mockAdminVehicles,
  mockVerifyDriver,
  mockConfirmBooking,
  mockRejectBooking,
  mockAssignDriver,
} from "@/lib/mock-db/actions";

export default function AdminPage() {
  return (
    <ProtectedRoute role="admin">
      <AdminPortal />
    </ProtectedRoute>
  );
}

const REJECT_REASONS = [
  { v: "no_drivers", l: "No drivers available" },
  { v: "customer_request", l: "Customer request" },
  { v: "payment_issue", l: "Payment issue" },
  { v: "other", l: "Other" },
];

interface AdminBooking {
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
  rejection_reason?: string | null;
  rejection_notes?: string | null;
  created_at: string;
  vehicles: { name: string | null } | null;
  customer: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  driver: {
    id: string;
    user_id: string;
    profile: {
      id: string;
      full_name: string | null;
    } | null;
  } | null;
}

interface AdminDriver {
  id: string;
  user_id: string;
  license_number: string;
  experience_years: number;
  is_available: boolean;
  is_verified: boolean;
  rating: number;
  total_earnings: number;
  created_at: string;
  city_of_residence: string | null;
  province: string | null;
  work_authorization: string | null;
  languages_spoken: string | null;
  time_availability: string | null;
  referral_name: string | null;
  photo_url: string | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

function AdminPortal() {
  const qc = useQueryClient();
  const supabase = useSupabase();
  const [filter, setFilter] = useState<string>("all");
  const [rejectFor, setRejectFor] = useState<AdminBooking | null>(null);
  const [rejReason, setRejReason] = useState<string>("no_drivers");
  const [rejNotes, setRejNotes] = useState<string>("");
  const [assignFor, setAssignFor] = useState<AdminBooking | null>(null);
  const [reviewDriver, setReviewDriver] = useState<AdminDriver | null>(null);

  const { data: bookings } = useQuery({
    queryKey: ["admin-bookings", filter],
    refetchInterval: 30_000, // new bookings appear without a manual reload
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminBookings(filter);
      // Explicit columns — start_otp is not client-readable (column privilege).
      let q = supabase
        .from("bookings")
        .select("id, reference, customer_id, driver_id, vehicle_id, trip_type, pickup_location, dropoff_location, pickup_datetime, duration_hours, flight_number, passenger_count, luggage_count, fare_estimate, passenger_name, passenger_phone, special_requests, status, payment_status, rejection_reason, rejection_notes, created_at, updated_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, vehicles(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter !== "all") q = q.eq("status", filter as Database["public"]["Enums"]["booking_status"]);
      const { data } = await q;
      if (!data) return [];

      // Hydrate customer + driver profiles in a single round each
      const customerIds = Array.from(new Set(data.map((b) => b.customer_id).filter(Boolean)));
      const driverIds = Array.from(new Set(data.map((b) => b.driver_id).filter(Boolean)));
      const [profilesRes, driversRes] = await Promise.all([
        customerIds.length ? supabase.from("profiles").select("id, full_name, email, phone").in("id", customerIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] }),
        driverIds.length ? supabase.from("drivers").select("id, user_id").in("id", driverIds) : Promise.resolve({ data: [] as { id: string; user_id: string }[] }),
      ]);
      const driverUserIds = (driversRes.data ?? []).map((d) => d.user_id);
      const driverProfilesRes = driverUserIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", driverUserIds)
        : { data: [] as { id: string; full_name: string | null }[] };

      const profilesById = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.id, p]));
      const driverProfilesById = Object.fromEntries((driverProfilesRes.data ?? []).map((p) => [p.id, p]));
      const driversById = Object.fromEntries((driversRes.data ?? []).map((d) => [d.id, { ...d, profile: driverProfilesById[d.user_id] || null }]));

      return data.map((b: any) => ({
        ...b,
        customer: profilesById[b.customer_id] ?? null,
        driver: b.driver_id ? driversById[b.driver_id] ?? null : null,
      })) as AdminBooking[];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminDrivers();
      const { data } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (!data) return [];
      const ids = data.map((d) => d.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", ids)
        : { data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] };
      const byId = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      return data.map((d) => ({ ...d, profile: byId[d.user_id] ?? null })) as AdminDriver[];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["admin-vehicles"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminVehicles();
      return (await supabase.from("vehicles").select("*").order("base_rate")).data;
    },
  });

  const verifyDriver = async (id: string, val: boolean) => {
    try {
      if (SUPABASE_ENABLED) await verifyDriverAction(id, val);
      else await mockVerifyDriver(id, val);
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      toast.success("Updated driver status");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to verify driver");
    }
  };

  const confirmBooking = async (b: AdminBooking) => {
    try {
      if (SUPABASE_ENABLED) await confirmBookingAction(b.id);
      else await mockConfirmBooking(b.id);
      toast.success(`Booking ${b.reference} confirmed`);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm booking");
    }
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    try {
      if (SUPABASE_ENABLED) await rejectBookingAction(rejectFor.id, rejReason, rejNotes || null);
      else await mockRejectBooking(rejectFor.id, rejReason, rejNotes || null);
      toast.success(`Booking ${rejectFor.reference} rejected`);
      setRejectFor(null);
      setRejNotes("");
      setRejReason("no_drivers");
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject booking");
    }
  };

  const assignDriver = async (driverId: string) => {
    if (!assignFor) return;
    try {
      if (SUPABASE_ENABLED) await assignDriverAction(assignFor.id, driverId);
      else await mockAssignDriver(assignFor.id, driverId);
      toast.success(`Driver assigned to ${assignFor.reference}`);
      setAssignFor(null);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign driver");
    }
  };

  const availableDrivers = (drivers ?? [])
    .filter((d) => d.is_verified && d.is_available)
    .sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));

  return (
    <SiteLayout solidNav>
      <section className="px-6 pb-24 pt-24 bg-background text-foreground">
        <div className="mx-auto max-w-7xl">
          <div className="eyebrow mb-3">Admin</div>
          <h1 className="text-4xl md:text-5xl font-light">Operations</h1>
          <AdminTabs />

          {/* Bookings */}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-light">Bookings</h2>
            <CustomSelect
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="driver_assigned">Driver Assigned</option>
              <option value="accepted">Driver Accepted</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </CustomSelect>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-3 md:hidden">
            {(bookings ?? []).map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-ink-soft">{b.reference}</div>
                    <div className="mt-0.5 truncate text-sm font-medium text-foreground">{b.customer?.full_name || b.passenger_name || "—"}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="mt-3 space-y-1 text-sm text-ink-muted">
                  <div className="truncate">{b.pickup_location} → {b.dropoff_location}</div>
                  <div className="text-xs text-ink-soft">{formatDateTime(b.pickup_datetime)}</div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="text-ink-muted">{b.vehicles?.name ?? "—"} · {b.driver?.profile?.full_name ?? "Unassigned"}</span>
                  <span className="font-medium text-foreground">${Number(b.fare_estimate).toFixed(2)}</span>
                </div>
                {(b.status === "pending" || b.status === "confirmed" || b.status === "driver_assigned" || b.status === "accepted") && (
                  <div className="mt-3 flex gap-2">
                    {b.status === "pending" ? (
                      <>
                        <button onClick={() => confirmBooking(b)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
                          <Check className="h-3 w-3" /> Confirm
                        </button>
                        <button onClick={() => setRejectFor(b)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground">
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setAssignFor(b)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground">
                        <UserPlus className="h-3 w-3" /> {b.driver_id ? "Reassign driver" : "Assign driver"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(!bookings || bookings.length === 0) && (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-ink-muted">No bookings.</div>
            )}
          </div>

          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="p-3">Ref</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Pickup</th>
                    <th className="p-3">Route</th>
                    <th className="p-3">Driver</th>
                    <th className="p-3">Vehicle</th>
                    <th className="p-3">Fare</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(bookings ?? []).map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/50 text-foreground">
                      <td className="p-3 font-mono text-xs">{b.reference}</td>
                      <td className="p-3">
                        <div className="font-medium">{b.customer?.full_name || b.passenger_name || "—"}</div>
                        <div className="text-xs text-ink-soft">{b.customer?.email ?? ""}</div>
                      </td>
                      <td className="p-3 text-ink-muted">{formatDateTime(b.pickup_datetime)}</td>
                      <td className="p-3 text-ink-muted">{b.pickup_location} → {b.dropoff_location}</td>
                      <td className="p-3">{b.driver?.profile?.full_name ?? <span className="text-ink-soft">Unassigned</span>}</td>
                      <td className="p-3">{b.vehicles?.name ?? "—"}</td>
                      <td className="p-3 font-medium">${Number(b.fare_estimate).toFixed(2)}</td>
                      <td className="p-3"><StatusBadge status={b.status} /></td>
                      <td className="p-3 text-right">
                        {b.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => confirmBooking(b)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-[#2A2A2A] cursor-pointer"
                            >
                              <Check className="h-3 w-3" /> Confirm
                            </button>
                            <button
                              onClick={() => setRejectFor(b)}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent cursor-pointer"
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        ) : (b.status === "confirmed" || b.status === "driver_assigned" || b.status === "accepted") ? (
                          <button
                            onClick={() => setAssignFor(b)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent cursor-pointer"
                          >
                            <UserPlus className="h-3 w-3" /> {b.driver_id ? "Reassign" : "Assign driver"}
                          </button>
                        ) : b.status === "rejected" && b.rejection_reason ? (
                          <span className="text-xs text-ink-soft">{REJECT_REASONS.find(r => r.v === b.rejection_reason)?.l ?? b.rejection_reason}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {(!bookings || bookings.length === 0) && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-ink-muted">No bookings.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drivers & applications */}
          {(() => {
            const pendingCount = (drivers ?? []).filter((d) => !d.is_verified).length;
            return (
              <div className="mt-12 mb-4 flex items-center gap-3 sm:mt-16">
                <h2 className="text-2xl font-light">Drivers &amp; applications</h2>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-[#c9a76a]/15 px-2.5 py-1 text-xs font-medium text-[#8a6d33]">{pendingCount} pending review</span>
                )}
              </div>
            );
          })()}

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {(drivers ?? []).map((d) => (
              <button
                key={d.id}
                onClick={() => setReviewDriver(d)}
                className={`block w-full rounded-xl border bg-card p-4 text-left transition hover:border-foreground/25 ${d.is_verified ? "border-border" : "border-[#c9a76a]/50"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{d.profile?.full_name ?? "Unnamed applicant"}</div>
                    {d.profile?.email && <div className="truncate text-xs text-ink-muted">{d.profile.email}</div>}
                    <div className="mt-0.5 truncate font-mono text-xs text-ink-soft">Lic · {d.license_number}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${d.is_verified ? "bg-foreground text-background" : "bg-[#c9a76a]/15 text-[#8a6d33]"}`}>
                    {d.is_verified ? "Verified" : "Pending"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-ink-muted">
                  <span>{d.experience_years}y exp · ★ {Number(d.rating).toFixed(2)}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    {d.is_verified ? "View" : "Review"} <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            ))}
            {(!drivers || drivers.length === 0) && (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-ink-muted">No drivers yet.</div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="p-3">Driver</th>
                    <th className="p-3">License</th>
                    <th className="p-3">Exp.</th>
                    <th className="p-3">Rating</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {(drivers ?? []).map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setReviewDriver(d)}
                      className="group cursor-pointer border-b border-border last:border-0 text-foreground transition-colors hover:bg-muted/50"
                    >
                      <td className="p-3">
                        <div className="font-medium">{d.profile?.full_name ?? "Unnamed applicant"}</div>
                        <div className="text-xs text-ink-soft">{d.profile?.email ?? String(d.user_id).slice(0, 8)}</div>
                      </td>
                      <td className="p-3 font-mono text-xs">{d.license_number}</td>
                      <td className="p-3">{d.experience_years}y</td>
                      <td className="p-3">{Number(d.rating).toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs ${d.is_verified ? "bg-foreground text-background" : "bg-[#c9a76a]/15 text-[#8a6d33]"}`}>
                          {d.is_verified ? "Verified" : "Pending"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-ink-muted group-hover:text-foreground">
                          {d.is_verified ? "View" : "Review"} <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!drivers || drivers.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-ink-muted">No drivers yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vehicles */}
          <h2 className="mt-12 mb-4 text-2xl font-light sm:mt-16">Fleet</h2>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {(vehicles ?? []).map((v) => (
              <div key={v.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{v.name}</div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${v.is_active ? "bg-foreground text-background" : "border border-border text-ink-muted"}`}>
                    {v.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-ink-muted">
                  <span className="capitalize">{v.type} · {v.capacity} seats</span>
                  <span className="font-medium text-foreground">${Number(v.base_rate).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Capacity</th>
                    <th className="p-3">Base rate</th>
                    <th className="p-3">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(vehicles ?? []).map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-0 text-foreground">
                      <td className="p-3">{v.name}</td>
                      <td className="p-3 text-ink-muted">{v.type}</td>
                      <td className="p-3">{v.capacity}</td>
                      <td className="p-3">${Number(v.base_rate).toFixed(2)}</td>
                      <td className="p-3">{v.is_active ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reject booking {rejectFor?.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-ink-muted font-medium">Reason</label>
              <CustomSelect
                value={rejReason}
                onChange={(e) => setRejReason(e.target.value)}
              >
                {REJECT_REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </CustomSelect>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-ink-muted font-medium">Notes (optional)</label>
              <textarea
                value={rejNotes}
                onChange={(e) => setRejNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground focus:border-foreground"
                placeholder="Anything the customer should know…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <button
              onClick={() => setRejectFor(null)}
              className="rounded-md border border-border bg-background text-foreground px-4 py-2 text-sm hover:bg-accent cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={submitReject}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-[#2A2A2A] cursor-pointer"
            >
              Reject booking
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign driver dialog */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent className="max-w-2xl bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Assign driver — {assignFor?.reference}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-ink-muted">
            Pickup: {assignFor?.pickup_location} · {assignFor && formatDateTime(assignFor.pickup_datetime)}
          </div>
          <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-md border border-border">
            {availableDrivers.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-muted">No verified, available drivers right now.</div>
            ) : (
              <ul className="divide-y divide-border">
                {availableDrivers.map((d) => {
                  const isCurrent = d.id === assignFor?.driver_id;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-foreground">
                          {(d.profile?.full_name ?? "D").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">{d.profile?.full_name ?? "Driver"}</div>
                          <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{Number(d.rating).toFixed(2)}</span>
                            <span>· {d.experience_years}y exp</span>
                            <span>· {d.is_available ? "Online" : "Offline"}</span>
                          </div>
                          {d.profile?.email && <div className="mt-0.5 truncate text-xs text-ink-soft">{d.profile.email}</div>}
                          <div className="truncate font-mono text-xs text-ink-soft">Lic · {d.license_number}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => assignDriver(d.id)}
                        disabled={isCurrent}
                        className="shrink-0 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium transition hover:bg-[#2A2A2A] disabled:opacity-50 cursor-pointer"
                      >
                        {isCurrent ? "Current" : "Assign"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter className="mt-4">
            <button
              onClick={() => setAssignFor(null)}
              className="rounded-md border border-border bg-background text-foreground px-4 py-2 text-sm hover:bg-accent cursor-pointer"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Driver application review */}
      <DriverReviewDialog
        driver={reviewDriver}
        open={!!reviewDriver}
        onClose={() => setReviewDriver(null)}
        onDecision={async (verified) => { await verifyDriver(reviewDriver!.id, verified); }}
      />
    </SiteLayout>
  );
}
