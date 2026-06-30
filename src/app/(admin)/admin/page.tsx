"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { useSupabase } from "@/hooks/use-supabase";
import { StatusBadge } from "@/components/site/StatusBadge";
import { useState } from "react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, X, UserPlus, Star } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  verifyDriverAction,
  confirmBookingAction,
  rejectBookingAction,
  assignDriverAction,
} from "@/lib/actions";

export default function AdminPage() {
  return (
    <ProtectedRoute role="admin">
      <AdminPortal />
    </ProtectedRoute>
  );
}

const CHART_GRID = "oklch(0.91 0 0)";
const CHART_LINE = "oklch(0.16 0 0)";

const REJECT_REASONS = [
  { v: "no_drivers", l: "No drivers available" },
  { v: "customer_request", l: "Customer request" },
  { v: "payment_issue", l: "Payment issue" },
  { v: "other", l: "Other" },
];

function AdminPortal() {
  const qc = useQueryClient();
  const supabase = useSupabase();
  const [filter, setFilter] = useState<string>("all");
  const [rejectFor, setRejectFor] = useState<any | null>(null);
  const [rejReason, setRejReason] = useState<string>("no_drivers");
  const [rejNotes, setRejNotes] = useState<string>("");
  const [assignFor, setAssignFor] = useState<any | null>(null);

  const { data: kpi } = useQuery({
    queryKey: ["admin-kpi"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [todays, active, monthly, pending] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_available", true).eq("is_verified", true),
        supabase.from("bookings").select("fare_estimate").gte("created_at", new Date(new Date().setDate(1)).toISOString()),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_verified", false),
      ]);
      const revenue = (monthly.data ?? []).reduce((sum: number, b: any) => sum + Number(b.fare_estimate ?? 0), 0);
      return { todays: todays.count ?? 0, active: active.count ?? 0, revenue, pending: pending.count ?? 0 };
    },
  });

  const { data: bookings } = useQuery({
    queryKey: ["admin-bookings", filter],
    queryFn: async () => {
      let q = supabase.from("bookings").select("*, vehicles(name)").order("created_at", { ascending: false }).limit(50);
      if (filter !== "all") q = q.eq("status", filter as any);
      const { data } = await q;
      if (!data) return [];

      // Hydrate customer + driver profiles in a single round each
      const customerIds = Array.from(new Set(data.map((b: any) => b.customer_id).filter(Boolean)));
      const driverIds = Array.from(new Set(data.map((b: any) => b.driver_id).filter(Boolean)));
      const [profilesRes, driversRes] = await Promise.all([
        customerIds.length ? supabase.from("profiles").select("id, full_name, email, phone").in("id", customerIds) : Promise.resolve({ data: [] as any[] }),
        driverIds.length ? supabase.from("drivers").select("id, user_id").in("id", driverIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const driverUserIds = (driversRes.data ?? []).map((d: any) => d.user_id);
      const driverProfilesRes = driverUserIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", driverUserIds)
        : { data: [] as any[] };

      const profilesById = Object.fromEntries((profilesRes.data ?? []).map((p: any) => [p.id, p]));
      const driverProfilesById = Object.fromEntries((driverProfilesRes.data ?? []).map((p: any) => [p.id, p]));
      const driversById = Object.fromEntries((driversRes.data ?? []).map((d: any) => [d.id, { ...d, profile: driverProfilesById[d.user_id] }]));

      return data.map((b: any) => ({
        ...b,
        customer: profilesById[b.customer_id] ?? null,
        driver: b.driver_id ? driversById[b.driver_id] ?? null : null,
      }));
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (!data) return [];
      const ids = data.map((d: any) => d.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", ids)
        : { data: [] as any[] };
      const byId = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return data.map((d: any) => ({ ...d, profile: byId[d.user_id] ?? null }));
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["admin-vehicles"],
    queryFn: async () => (await supabase.from("vehicles").select("*").order("base_rate")).data,
  });

  const { data: weekly } = useQuery({
    queryKey: ["admin-weekly"],
    queryFn: async () => {
      const start = new Date(); start.setDate(start.getDate() - 30);
      const { data } = await supabase.from("bookings").select("created_at, fare_estimate").gte("created_at", start.toISOString());
      const buckets: Record<string, { week: string; bookings: number; revenue: number }> = {};
      (data ?? []).forEach((b: any) => {
        const d = new Date(b.created_at);
        const wk = `W${Math.ceil(d.getDate() / 7)}`;
        if (!buckets[wk]) buckets[wk] = { week: wk, bookings: 0, revenue: 0 };
        buckets[wk].bookings += 1;
        buckets[wk].revenue += Number(b.fare_estimate ?? 0);
      });
      return Object.values(buckets);
    },
  });

  const verifyDriver = async (id: string, val: boolean) => {
    try {
      await verifyDriverAction(id, val);
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      toast.success("Updated driver status");
    } catch (err: any) {
      toast.error(err.message || "Failed to verify driver");
    }
  };

  const confirmBooking = async (b: any) => {
    try {
      await confirmBookingAction(b.id);
      toast.success(`Booking ${b.reference} confirmed`);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm booking");
    }
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    try {
      await rejectBookingAction(rejectFor.id, rejReason, rejNotes || null);
      toast.success(`Booking ${rejectFor.reference} rejected`);
      setRejectFor(null);
      setRejNotes("");
      setRejReason("no_drivers");
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject booking");
    }
  };

  const assignDriver = async (driverId: string) => {
    if (!assignFor) return;
    try {
      await assignDriverAction(assignFor.id, driverId);
      toast.success(`Driver assigned to ${assignFor.reference}`);
      setAssignFor(null);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to assign driver");
    }
  };

  const availableDrivers = (drivers ?? [])
    .filter((d: any) => d.is_verified && d.is_available)
    .sort((a: any, b: any) => Number(b.rating ?? 0) - Number(a.rating ?? 0));

  return (
    <SiteLayout solidNav>
      <section className="px-6 pb-24 pt-24 bg-background text-foreground">
        <div className="mx-auto max-w-7xl">
          <div className="eyebrow mb-3">Admin</div>
          <h1 className="text-4xl md:text-5xl font-light">Operations</h1>

          {/* KPIs */}
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { l: "Bookings today", v: kpi?.todays ?? 0 },
              { l: "Active drivers", v: kpi?.active ?? 0 },
              { l: "Monthly revenue", v: `$${(kpi?.revenue ?? 0).toFixed(0)}` },
              { l: "Pending verifications", v: kpi?.pending ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-md border border-border bg-card p-6">
                <div className="eyebrow">{k.l}</div>
                <div className="mt-2 text-3xl font-light">{k.v}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-6">
              <div className="eyebrow mb-4">Bookings (30d)</div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly ?? []}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="week" stroke="#6B6B6B" fontSize={11} />
                    <YAxis stroke="#6B6B6B" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E5E5", fontSize: 12, color: "#101010" }} />
                    <Bar dataKey="bookings" fill={CHART_LINE} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-6">
              <div className="eyebrow mb-4">Revenue trend</div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekly ?? []}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="week" stroke="#6B6B6B" fontSize={11} />
                    <YAxis stroke="#6B6B6B" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E5E5", fontSize: 12, color: "#101010" }} />
                    <Line type="monotone" dataKey="revenue" stroke={CHART_LINE} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bookings */}
          <div className="mt-16 flex items-end justify-between">
            <h2 className="text-2xl font-light">Bookings</h2>
            <CustomSelect
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="driver_assigned">Driver Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </CustomSelect>
          </div>
          <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
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
                  {(bookings ?? []).map((b: any) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/50 text-foreground">
                      <td className="p-3 font-mono text-xs">{b.reference}</td>
                      <td className="p-3">
                        <div className="font-medium">{b.customer?.full_name || b.passenger_name || "—"}</div>
                        <div className="text-xs text-ink-soft">{b.customer?.email ?? ""}</div>
                      </td>
                      <td className="p-3 text-ink-muted">{new Date(b.pickup_datetime).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td>
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
                        ) : (b.status === "confirmed" || b.status === "driver_assigned") ? (
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

          {/* Drivers */}
          <h2 className="mt-16 mb-4 text-2xl font-light">Drivers</h2>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">License</th>
                    <th className="p-3">Exp.</th>
                    <th className="p-3">Rating</th>
                    <th className="p-3">Verified</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(drivers ?? []).map((d: any) => (
                    <tr key={d.id} className="border-b border-border last:border-0 text-foreground">
                      <td className="p-3 font-mono text-xs">{String(d.user_id).slice(0, 8)}</td>
                      <td className="p-3 font-mono text-xs">{d.license_number}</td>
                      <td className="p-3">{d.experience_years}y</td>
                      <td className="p-3">{Number(d.rating).toFixed(2)}</td>
                      <td className="p-3">{d.is_verified ? "Yes" : "No"}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => verifyDriver(d.id, !d.is_verified)}
                          className="text-xs text-ink-muted hover:text-foreground cursor-pointer underline"
                        >
                          {d.is_verified ? "Deactivate" : "Verify"}
                        </button>
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
          <h2 className="mt-16 mb-4 text-2xl font-light">Fleet</h2>
          <div className="overflow-hidden rounded-md border border-border bg-card">
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
                  {(vehicles ?? []).map((v: any) => (
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
            Pickup: {assignFor?.pickup_location} · {assignFor && new Date(assignFor.pickup_datetime).toLocaleString("en-CA", { timeZone: "America/Toronto" })}
          </div>
          <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-md border border-border">
            {availableDrivers.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-muted">No verified, available drivers right now.</div>
            ) : (
              <ul className="divide-y divide-border">
                {availableDrivers.map((d: any) => {
                  const isCurrent = d.id === assignFor?.driver_id;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-4 p-3 hover:bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-sm font-medium text-foreground">
                          {(d.profile?.full_name ?? "D").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{d.profile?.full_name ?? "Driver"}</div>
                          <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{Number(d.rating).toFixed(2)}</span>
                            <span>· {d.experience_years}y exp</span>
                            <span>· {d.is_available ? "Online" : "Offline"}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => assignDriver(d.id)}
                        disabled={isCurrent}
                        className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium transition hover:bg-[#2A2A2A] disabled:opacity-50 cursor-pointer"
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
    </SiteLayout>
  );
}
