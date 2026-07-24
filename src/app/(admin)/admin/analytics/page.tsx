"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { Banknote, CreditCard, Trophy } from "lucide-react";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { Panel, StatTile } from "@/components/admin/ui";
import { useSupabase } from "@/hooks/use-supabase";
import { useAdminKpi, useAdminDrivers } from "@/components/admin/admin-data";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { mockEarningsRows } from "@/lib/mock-db/actions";

export default function AdminAnalyticsPage() {
  return (
    <ProtectedRoute role="admin">
      <Analytics />
    </ProtectedRoute>
  );
}

const CHART_GRID = "rgba(255,255,255,0.08)";
const CHART_GOLD = "#c9a76a";
const CHART_AXIS = "rgba(255,255,255,0.45)";
const TOOLTIP_STYLE = {
  background: "#131315",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  fontSize: 12,
  color: "#ffffff",
};

const RANGES = [
  { v: 7, l: "7 days" },
  { v: 30, l: "30 days" },
  { v: 90, l: "90 days" },
] as const;

/** One booking, as the earnings queries see it. */
interface EarningsRow {
  pickup_datetime: string;
  fare_estimate: number;
  airport_fee: number | null;
  driver_payout: number | null;
  tip: number | null;
  status: string;
  payment_status: string;
  payment_mode: string | null;
  balance_method: string | null;
  cancellation_penalty: number | null;
  driver_id: string | null;
}

const dayKey = (iso: string) => iso.slice(0, 10);
const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

/**
 * The client's earnings model: the fare TOTAL is revenue; the driver's share
 * and SophRia's share are separate earnings. Tips are 100% the driver's; the
 * GTAA airport fee and HST are nobody's earnings. Splits are only final at
 * completion, so the earnings figures track COMPLETED rides while revenue
 * tracks everything not cancelled/rejected.
 */
function splitOf(r: EarningsRow) {
  const fare = Number(r.fare_estimate ?? 0);
  const payout = Number(r.driver_payout ?? 0);
  const tip = Math.max(0, Number(r.tip ?? 0));
  return {
    fare,
    driver: payout + tip,
    tips: tip,
    sophria: Math.max(0, fare - Number(r.airport_fee ?? 0) - payout),
  };
}

function Analytics() {
  const supabase = useSupabase();
  const { data: kpi } = useAdminKpi();
  const { data: drivers } = useAdminDrivers();
  const [range, setRange] = useState<(typeof RANGES)[number]["v"]>(30);
  const [driverFilter, setDriverFilter] = useState<string>("all");

  // Rows are bucketed by PICKUP date: "earnings day by day" means the day the
  // ride ran, not the day it was booked. days[] is precomputed in the queryFn
  // (render must stay pure) and zero-filled so quiet days don't vanish.
  const { data } = useQuery({
    queryKey: ["admin-earnings", range],
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ rows: EarningsRow[]; days: string[] }> => {
      const now = Date.now();
      const since = new Date(now - range * 86_400_000);
      const days: string[] = [];
      for (let t = since.getTime(); t <= now; t += 86_400_000) {
        days.push(dayKey(new Date(t).toISOString()));
      }
      const sinceIso = since.toISOString();
      if (!SUPABASE_ENABLED) return { rows: (await mockEarningsRows(sinceIso)) as EarningsRow[], days };
      const { data } = await supabase
        .from("bookings")
        .select(
          "pickup_datetime, fare_estimate, airport_fee, driver_payout, tip, status, payment_status, payment_mode, balance_method, cancellation_penalty, driver_id",
        )
        .gte("pickup_datetime", sinceIso)
        .lte("pickup_datetime", new Date(now).toISOString());
      return { rows: (data ?? []) as EarningsRow[], days };
    },
  });

  const driverName = useMemo(() => {
    const byId: Record<string, string> = {};
    (drivers ?? []).forEach((d) => { byId[d.id] = d.profile?.full_name ?? "Driver"; });
    return byId;
  }, [drivers]);

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => driverFilter === "all" || r.driver_id === driverFilter),
    [data, driverFilter],
  );

  // ---- Totals for the selected range (and driver, if filtered) ----
  const totals = useMemo(() => {
    const t = { revenue: 0, driver: 0, sophria: 0, tips: 0, completed: 0, cashCollected: 0, penalties: 0 };
    for (const r of rows) {
      if (r.status === "cancelled") t.penalties += Number(r.cancellation_penalty ?? 0);
      if (r.status === "cancelled" || r.status === "rejected") continue;
      const s = splitOf(r);
      t.revenue += s.fare;
      if (r.status === "completed") {
        t.completed += 1;
        t.driver += s.driver;
        t.sophria += s.sophria;
        t.tips += s.tips;
        if (r.payment_mode === "deposit" && r.balance_method === "cash") t.cashCollected += Number(r.driver_payout ?? 0);
      }
    }
    return t;
  }, [rows]);

  // ---- Day-by-day series, zero-filled ----
  const daily = useMemo(() => {
    const byDay: Record<string, { day: string; label: string; rides: number; revenue: number; driverEarnings: number; sophriaEarnings: number }> = {};
    for (const key of data?.days ?? []) {
      byDay[key] = { day: key, label: dayLabel(key), rides: 0, revenue: 0, driverEarnings: 0, sophriaEarnings: 0 };
    }
    for (const r of rows) {
      const bucket = byDay[dayKey(r.pickup_datetime)];
      if (!bucket) continue;
      bucket.rides += 1;
      if (r.status === "cancelled" || r.status === "rejected") continue;
      const s = splitOf(r);
      bucket.revenue += s.fare;
      if (r.status === "completed") {
        bucket.driverEarnings += s.driver;
        bucket.sophriaEarnings += s.sophria;
      }
    }
    return Object.values(byDay);
  }, [rows, data]);

  // ---- The earning funnel: where every fare in the range currently sits ----
  const funnel = useMemo(() => {
    const stage = (label: string, hint: string) => ({ label, hint, count: 0, value: 0 });
    const stages = {
      requested: stage("Requested", "awaiting confirmation"),
      awaitingPayment: stage("Awaiting payment", "confirmed, not yet secured"),
      secured: stage("Secured", "paid/held or deposit down — dispatchable"),
      completed: stage("Completed", "earned and split"),
      lost: stage("Lost", "cancelled or rejected · value = penalties kept"),
    };
    for (const r of rows) {
      const fare = Number(r.fare_estimate ?? 0);
      if (r.status === "cancelled" || r.status === "rejected") {
        stages.lost.count += 1;
        stages.lost.value += Number(r.cancellation_penalty ?? 0);
      } else if (r.status === "completed") {
        stages.completed.count += 1;
        stages.completed.value += fare;
      } else if (r.payment_status === "paid" || r.payment_status === "authorized") {
        stages.secured.count += 1;
        stages.secured.value += fare;
      } else if (r.status === "confirmed") {
        stages.awaitingPayment.count += 1;
        stages.awaitingPayment.value += fare;
      } else {
        stages.requested.count += 1;
        stages.requested.value += fare;
      }
    }
    return Object.values(stages);
  }, [rows]);

  // ---- Driver ranking (always across ALL drivers; the filter highlights) ----
  const leaderboard = useMemo(() => {
    const byDriver: Record<string, { id: string; rides: number; payout: number; tips: number; sophria: number; cashRides: number }> = {};
    for (const r of data?.rows ?? []) {
      if (r.status !== "completed" || !r.driver_id) continue;
      const s = splitOf(r);
      const e = (byDriver[r.driver_id] ??= { id: r.driver_id, rides: 0, payout: 0, tips: 0, sophria: 0, cashRides: 0 });
      e.rides += 1;
      e.payout += Number(r.driver_payout ?? 0);
      e.tips += s.tips;
      e.sophria += s.sophria;
      if (r.payment_mode === "deposit" && r.balance_method === "cash") e.cashRides += 1;
    }
    return Object.values(byDriver)
      .map((e) => ({ ...e, earned: e.payout + e.tips }))
      .sort((a, b) => b.earned - a.earned);
  }, [data]);

  const filterName = driverFilter === "all" ? null : driverName[driverFilter] ?? "driver";

  return (
    <AdminShell title="Analytics" sub="Revenue, the earnings split, and who's earning it.">
      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.v}
            onClick={() => setRange(r.v)}
            className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              range === r.v ? "bg-white text-black" : "bg-white/[0.06] text-white/60 hover:text-white"
            }`}
          >
            {r.l}
          </button>
        ))}
        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="ml-auto cursor-pointer rounded-sm border border-white/15 bg-transparent px-2.5 py-1.5 text-xs text-white/70 focus:border-gold focus:outline-none [&>option]:bg-night"
          aria-label="Filter by driver"
        >
          <option value="all">All drivers</option>
          {(drivers ?? [])
            .filter((d) => d.is_verified)
            .map((d) => (
              <option key={d.id} value={d.id}>{d.profile?.full_name ?? "Driver"}</option>
            ))}
        </select>
      </div>

      {/* Range-scoped money tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Revenue (${range}d${filterName ? ` · ${filterName}` : ""})`}
          value={`$${Math.round(totals.revenue).toLocaleString()}`}
          sub="booked fares, pre-HST · excl. cancelled"
        />
        <StatTile
          label="Driver earnings"
          value={`$${Math.round(totals.driver).toLocaleString()}`}
          sub={`payouts + $${Math.round(totals.tips).toLocaleString()} tips · ${totals.completed} rides`}
        />
        <StatTile
          label="SophRia earnings"
          value={`$${Math.round(totals.sophria).toLocaleString()}`}
          sub="commission · excl. tips, airport fees, HST"
          accent
        />
        <StatTile
          label="Collected in cash"
          value={`$${Math.round(totals.cashCollected).toLocaleString()}`}
          sub="deposit rides settled with the chauffeur"
        />
      </div>

      {/* Live-ops row */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Bookings today" value={kpi?.todays ?? 0} />
        <StatTile label="Drivers online" value={kpi?.active ?? 0} />
        <StatTile label="Revenue this month" value={`$${Math.round(kpi?.revenue ?? 0).toLocaleString()}`} sub="calendar month, all drivers" />
        <StatTile label="Pending verifications" value={kpi?.pending ?? 0} accent={(kpi?.pending ?? 0) > 0} />
      </div>

      {/* Earning funnel */}
      <Panel title="Earning funnel" hint="Every booking with a pickup in the range, by where its money sits now." className="mt-6">
        <div className="grid gap-px overflow-hidden rounded-sm bg-white/10 sm:grid-cols-5">
          {funnel.map((s, i) => (
            <div key={s.label} className="bg-night-panel p-4">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/45">
                {i + 1}. {s.label}
              </div>
              <div className={`mt-1.5 font-display text-2xl ${s.label === "Completed" ? "text-gold-soft" : s.label === "Lost" ? "text-white/50" : "text-white"}`}>
                {s.count}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-white/60">${Math.round(s.value).toLocaleString()}</div>
              <div className="mt-1 text-[11px] leading-snug text-white/40">{s.hint}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Day-by-day */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Earnings, day by day" hint="Revenue when booked rides ran; earnings split on completion.">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                <Line type="monotone" name="Revenue" dataKey="revenue" stroke={CHART_GOLD} strokeWidth={2} dot={false} />
                <Line type="monotone" name="Driver earnings" dataKey="driverEarnings" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" name="SophRia earnings" dataKey="sophriaEarnings" stroke="#4ade80" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Rides, day by day">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar name="Rides" dataKey="rides" fill={CHART_GOLD} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Driver ranking */}
      <Panel
        title="Driver earnings ranking"
        hint="Completed rides in the range. Earned = payout + tips (cash and online alike); SophRia column is the commission their rides generated."
        className="mt-6"
      >
        {leaderboard.length === 0 ? (
          <div className="py-6 text-sm text-white/45">No completed rides in this range yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-3 pb-3">#</th>
                  <th className="px-3 pb-3">Driver</th>
                  <th className="px-3 pb-3 text-right">Rides</th>
                  <th className="px-3 pb-3 text-right">Payouts</th>
                  <th className="px-3 pb-3 text-right">Tips</th>
                  <th className="px-3 pb-3 text-right">Earned</th>
                  <th className="px-3 pb-3 text-right">SophRia earned</th>
                  <th className="px-3 pb-3 text-right">Cash rides</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((d, i) => {
                  const highlighted = driverFilter === d.id;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setDriverFilter(highlighted ? "all" : d.id)}
                      className={`cursor-pointer border-b border-white/10 text-white transition-colors last:border-0 hover:bg-white/[0.03] ${
                        highlighted ? "bg-gold/5" : ""
                      }`}
                      title={highlighted ? "Click to clear the filter" : "Click to filter the page to this driver"}
                    >
                      <td className="p-3">
                        {i === 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-gold-soft"><Trophy className="h-3.5 w-3.5" />1</span>
                        ) : (
                          <span className="text-white/60">{i + 1}</span>
                        )}
                      </td>
                      <td className="p-3 font-medium">{driverName[d.id] ?? "Driver"}</td>
                      <td className="p-3 text-right text-white/70">{d.rides}</td>
                      <td className="p-3 text-right tabular-nums text-white/70">${d.payout.toFixed(0)}</td>
                      <td className="p-3 text-right tabular-nums text-white/70">${d.tips.toFixed(0)}</td>
                      <td className="p-3 text-right tabular-nums font-medium text-gold-soft">${d.earned.toFixed(0)}</td>
                      <td className="p-3 text-right tabular-nums text-emerald-300/80">${d.sophria.toFixed(0)}</td>
                      <td className="p-3 text-right text-white/60">
                        {d.cashRides > 0 ? (
                          <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" />{d.cashRides}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-white/40"><CreditCard className="h-3 w-3" />0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
