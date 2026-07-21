"use client";

import Link from "next/link";
import { Check, ArrowRight, CalendarClock, Users, UserPlus } from "lucide-react";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { Panel, StatTile, CountChip } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/datetime";
import {
  useAdminBookings,
  useAdminDrivers,
  useAdminKpi,
  useAdminActions,
} from "@/components/admin/admin-data";

export default function AdminOverviewPage() {
  return (
    <ProtectedRoute role="admin">
      <Overview />
    </ProtectedRoute>
  );
}

/**
 * The dispatcher's morning view: what needs a decision right now, and only
 * enough numbers to know how the day is going. Everything else lives on its
 * own page.
 */
function Overview() {
  const { data: bookings } = useAdminBookings("all");
  const { data: drivers } = useAdminDrivers();
  const { data: kpi } = useAdminKpi();
  const { confirmBooking } = useAdminActions();

  const pending = (bookings ?? []).filter((b) => b.status === "pending");
  // Paid OR authorized (card hold) both mean the money is secured — mirror of
  // assignDriverAction's own gate. driver_assigned always has driver_id set,
  // so "confirmed" is the only assignable status without a driver.
  const readyToAssign = (bookings ?? []).filter(
    (b) => ["paid", "authorized"].includes(b.payment_status) && !b.driver_id && b.status === "confirmed",
  );
  const applications = (drivers ?? []).filter((d) => !d.is_verified);
  const needsAction = pending.length + readyToAssign.length + applications.length;

  return (
    <AdminShell
      title="Overview"
      sub="What needs you right now — details live on their own pages."
    >
      {/* KPI strip — four numbers, no more */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Needs action" value={needsAction} accent={needsAction > 0} sub={needsAction === 0 ? "All clear" : "across bookings & drivers"} />
        <StatTile label="Bookings today" value={kpi?.todays ?? 0} />
        <StatTile label="Drivers online" value={kpi?.active ?? 0} />
        <StatTile label="Revenue this month" value={`$${Math.round(kpi?.revenue ?? 0).toLocaleString()}`} sub="fares, pre-HST" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* New requests */}
        <Panel
          title="New requests"
          badge={<CountChip n={pending.length} />}
          action={
            <Link href="/admin/bookings?f=pending" className="inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-gold-soft">
              All bookings <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {pending.length === 0 ? (
            <EmptyNote icon={CalendarClock} text="No bookings waiting for confirmation." />
          ) : (
            <ul className="divide-y divide-white/10">
              {pending.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.customer?.full_name || b.passenger_name || b.reference}</div>
                    <div className="mt-0.5 truncate text-xs text-white/50">
                      {formatDateTime(b.pickup_datetime)} · ${Number(b.fare_estimate).toFixed(0)} · {b.pickup_location}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => confirmBooking(b)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-sm bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gold-soft"
                    >
                      <Check className="h-3 w-3" /> Confirm
                    </button>
                    <Link
                      href="/admin/bookings?f=pending"
                      className="rounded-sm border border-white/25 px-3 py-1.5 text-xs text-white transition hover:border-gold hover:text-gold-soft"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Paid, waiting for a chauffeur */}
        <Panel
          title="Ready to assign"
          badge={<CountChip n={readyToAssign.length} />}
          action={
            <Link href="/admin/bookings?f=confirmed" className="inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-gold-soft">
              All bookings <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {readyToAssign.length === 0 ? (
            <EmptyNote icon={UserPlus} text="No paid rides waiting for a chauffeur." />
          ) : (
            <ul className="divide-y divide-white/10">
              {readyToAssign.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.customer?.full_name || b.passenger_name || b.reference}</div>
                    <div className="mt-0.5 truncate text-xs text-white/50">
                      {formatDateTime(b.pickup_datetime)} · {b.vehicles?.name ?? "—"} · ${Number(b.fare_estimate).toFixed(0)} {b.payment_status === "authorized" ? "held" : "paid"}
                    </div>
                  </div>
                  <Link
                    href="/admin/bookings?f=confirmed"
                    className="shrink-0 rounded-sm bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gold-soft"
                  >
                    Assign
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Driver applications */}
        <Panel
          title="Driver applications"
          badge={<CountChip n={applications.length} />}
          action={
            <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-gold-soft">
              All drivers <ArrowRight className="h-3 w-3" />
            </Link>
          }
          className="lg:col-span-2"
        >
          {applications.length === 0 ? (
            <EmptyNote icon={Users} text="No applications waiting for review." />
          ) : (
            <ul className="divide-y divide-white/10">
              {applications.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-medium text-gold-soft">
                      {(d.profile?.full_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{d.profile?.full_name ?? "Unnamed applicant"}</div>
                      <div className="mt-0.5 truncate text-xs text-white/50">
                        {d.experience_years}y experience{d.vehicle_make ? ` · ${d.vehicle_make} ${d.vehicle_model ?? ""}` : ""}{d.city_of_residence ? ` · ${d.city_of_residence}` : ""}
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/admin/drivers"
                    className="shrink-0 rounded-sm border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold-soft transition hover:bg-gold/10"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}

function EmptyNote({ icon: Icon, text }: { icon: typeof Check; text: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-sm text-white/45">
      <Icon className="h-4 w-4 text-white/30" />
      {text}
    </div>
  );
}
