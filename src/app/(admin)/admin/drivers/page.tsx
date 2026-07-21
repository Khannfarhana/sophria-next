"use client";

import { useState } from "react";
import { Star, ChevronRight } from "lucide-react";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { Panel, CountChip } from "@/components/admin/ui";
import { DriverReviewDialog } from "@/components/site/DriverReviewDialog";
import { DEFAULT_DRIVER_PAYOUT_RATE } from "@/lib/pricing";
import {
  useAdminDrivers,
  useAdminActions,
  type AdminDriver,
} from "@/components/admin/admin-data";

export default function AdminDriversPage() {
  return (
    <ProtectedRoute role="admin">
      <Drivers />
    </ProtectedRoute>
  );
}

/** Applications to review up top; the verified roster below. */
function Drivers() {
  const { data: drivers } = useAdminDrivers();
  const { verifyDriver, setCommission } = useAdminActions();
  const [reviewDriver, setReviewDriver] = useState<AdminDriver | null>(null);

  const applications = (drivers ?? []).filter((d) => !d.is_verified);
  const roster = (drivers ?? []).filter((d) => d.is_verified);

  return (
    <AdminShell
      title="Drivers"
      sub="Review applications and manage the verified roster."
    >
      {/* Applications */}
      <Panel title="Applications" badge={<CountChip n={applications.length} />}>
        {applications.length === 0 ? (
          <div className="py-6 text-sm text-white/45">No applications waiting for review.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {applications.map((d) => (
              <button
                key={d.id}
                onClick={() => setReviewDriver(d)}
                className="cursor-pointer rounded-sm border border-gold/30 bg-white/[0.03] p-4 text-left transition hover:border-gold hover:bg-gold/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-medium text-gold-soft">
                      {(d.profile?.full_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{d.profile?.full_name ?? "Unnamed applicant"}</div>
                      <div className="truncate text-xs text-white/50">{d.profile?.email ?? ""}</div>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gold-soft">
                    Review <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/55">
                  <span>{d.experience_years}y experience</span>
                  {d.vehicle_make && <span>{d.vehicle_make} {d.vehicle_model ?? ""} {d.vehicle_year ?? ""}</span>}
                  {d.city_of_residence && <span>{d.city_of_residence}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Verified roster */}
      <Panel title="Roster" badge={<CountChip n={roster.length} tone="dim" />} className="mt-6">
        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {roster.map((d) => (
            <button
              key={d.id}
              onClick={() => setReviewDriver(d)}
              className="block w-full cursor-pointer rounded-sm bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{d.profile?.full_name ?? "Driver"}</div>
                  <div className="truncate text-xs text-white/50">{d.profile?.email ?? ""}</div>
                </div>
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.is_available ? "bg-emerald-400" : "bg-white/25"}`} title={d.is_available ? "Online" : "Offline"} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-white/55">
                <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-gold" />{Number(d.rating).toFixed(2)} · {d.experience_years}y · {Math.round(Number(d.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100)}%</span>
                <span>${Number(d.total_earnings).toFixed(0)} earned</span>
              </div>
            </button>
          ))}
          {roster.length === 0 && <div className="py-6 text-sm text-white/45">No verified drivers yet.</div>}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 pb-3">Driver</th>
                <th className="px-3 pb-3">Availability</th>
                <th className="px-3 pb-3">Rating</th>
                <th className="px-3 pb-3">Experience</th>
                <th className="px-3 pb-3">Share</th>
                <th className="px-3 pb-3">Earnings</th>
                <th className="px-3 pb-3 text-right" aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {roster.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setReviewDriver(d)}
                  className="group cursor-pointer border-b border-white/10 text-white transition-colors last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="p-3">
                    <div className="font-medium">{d.profile?.full_name ?? "Driver"}</div>
                    <div className="text-xs text-white/45">{d.profile?.email ?? String(d.user_id).slice(0, 8)}</div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-2 text-xs ${d.is_available ? "text-emerald-300" : "text-white/45"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${d.is_available ? "bg-emerald-400" : "bg-white/25"}`} />
                      {d.is_available ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-gold" />{Number(d.rating).toFixed(2)}</span>
                  </td>
                  <td className="p-3 text-white/70">{d.experience_years}y</td>
                  <td className="p-3 text-white/70">{Math.round(Number(d.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100)}%</td>
                  <td className="p-3 text-white/70">${Number(d.total_earnings).toFixed(0)}</td>
                  <td className="p-3 text-right">
                    <span className="inline-flex items-center gap-1 text-xs text-white/45 group-hover:text-white">
                      View <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </td>
                </tr>
              ))}
              {roster.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-white/45">No verified drivers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <DriverReviewDialog
        driver={reviewDriver}
        open={!!reviewDriver}
        onClose={() => setReviewDriver(null)}
        onDecision={async (verified) => { await verifyDriver(reviewDriver!.id, verified); }}
        onCommission={async (rate) => {
          await setCommission(reviewDriver!.id, rate);
          setReviewDriver((d) => d && { ...d, commission_rate: rate });
        }}
      />
    </AdminShell>
  );
}
