"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { Panel, StatTile } from "@/components/admin/ui";
import { useSupabase } from "@/hooks/use-supabase";
import { useAdminKpi } from "@/components/admin/admin-data";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { mockAdminWeekly } from "@/lib/mock-db/actions";

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

function Analytics() {
  const supabase = useSupabase();
  const { data: kpi } = useAdminKpi();

  const { data: weekly } = useQuery({
    queryKey: ["admin-weekly"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminWeekly();
      const start = new Date(); start.setDate(start.getDate() - 30);
      const { data } = await supabase.from("bookings").select("created_at, fare_estimate").gte("created_at", start.toISOString());
      const buckets: Record<string, { week: string; bookings: number; revenue: number }> = {};
      (data ?? []).forEach((b) => {
        const d = new Date(b.created_at);
        const wk = `W${Math.ceil(d.getDate() / 7)}`;
        if (!buckets[wk]) buckets[wk] = { week: wk, bookings: 0, revenue: 0 };
        buckets[wk].bookings += 1;
        buckets[wk].revenue += Number(b.fare_estimate ?? 0);
      });
      return Object.values(buckets);
    },
  });

  return (
    <AdminShell title="Analytics" sub="The last 30 days at a glance.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Bookings today" value={kpi?.todays ?? 0} />
        <StatTile label="Drivers online" value={kpi?.active ?? 0} />
        <StatTile label="Revenue this month" value={`$${Math.round(kpi?.revenue ?? 0).toLocaleString()}`} sub="fares, pre-HST" />
        <StatTile label="Pending verifications" value={kpi?.pending ?? 0} accent={(kpi?.pending ?? 0) > 0} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Panel title="Bookings">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly ?? []}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="bookings" fill={CHART_GOLD} radius={[3, 3, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Revenue">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly ?? []}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
                <Line type="monotone" dataKey="revenue" stroke={CHART_GOLD} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
