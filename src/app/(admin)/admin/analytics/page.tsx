"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminTabs } from "@/components/site/AdminTabs";
import { useSupabase } from "@/hooks/use-supabase";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { mockAdminKpi, mockAdminWeekly } from "@/lib/mock-db/actions";

export default function AdminAnalyticsPage() {
  return (
    <ProtectedRoute role="admin">
      <Analytics />
    </ProtectedRoute>
  );
}

const CHART_GRID = "oklch(0.91 0 0)";
const CHART_LINE = "oklch(0.16 0 0)";

function Analytics() {
  const supabase = useSupabase();

  const { data: kpi } = useQuery({
    queryKey: ["admin-kpi"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminKpi();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [todays, active, monthly, pending] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_available", true).eq("is_verified", true),
        supabase.from("bookings").select("fare_estimate").gte("created_at", new Date(new Date().setDate(1)).toISOString()),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_verified", false),
      ]);
      const revenue = (monthly.data ?? []).reduce((sum: number, b) => sum + Number(b.fare_estimate ?? 0), 0);
      return { todays: todays.count ?? 0, active: active.count ?? 0, revenue, pending: pending.count ?? 0 };
    },
  });

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
    <SiteLayout solidNav>
      <section className="px-6 pb-24 pt-24 bg-background text-foreground">
        <div className="mx-auto max-w-7xl">
          <div className="eyebrow mb-3">Admin</div>
          <h1 className="text-4xl md:text-5xl font-light">Analytics</h1>
          <AdminTabs />

          {/* KPIs */}
          <div className="mt-8 grid grid-cols-2 gap-3 md:mt-10 md:grid-cols-4 md:gap-4">
            {[
              { l: "Bookings today", v: kpi?.todays ?? 0 },
              { l: "Active drivers", v: kpi?.active ?? 0 },
              { l: "Monthly revenue", v: `$${(kpi?.revenue ?? 0).toFixed(0)}` },
              { l: "Pending verifications", v: kpi?.pending ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4 md:p-6">
                <div className="eyebrow text-[10px] md:text-xs">{k.l}</div>
                <div className="mt-2 text-2xl font-light md:text-3xl">{k.v}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2 md:gap-6">
            <div className="rounded-xl border border-border bg-card p-5 md:p-6">
              <div className="eyebrow mb-4">Bookings (30d)</div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly ?? []}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="week" stroke="#6B6B6B" fontSize={11} />
                    <YAxis stroke="#6B6B6B" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E5E5", fontSize: 12, color: "#101010" }} />
                    <Bar dataKey="bookings" fill={CHART_LINE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 md:p-6">
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
        </div>
      </section>
    </SiteLayout>
  );
}
