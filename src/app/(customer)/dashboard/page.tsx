"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { StatusBadge } from "@/components/site/StatusBadge";
import { cancelBookingAction } from "@/lib/actions";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { user, signOut } = useAuth();
  const supabase = useSupabase();
  const qc = useQueryClient();
  
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, vehicles(name)")
        .order("pickup_datetime", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const cancel = async (id: string) => {
    try {
      await cancelBookingAction(id);
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel booking");
    }
  };

  return (
    <SiteLayout>
      <section className="px-6 pb-24 pt-24 bg-background">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="eyebrow mb-3">Customer Portal</div>
              <h1 className="text-4xl md:text-5xl font-light text-foreground">My Bookings</h1>
            </div>
            <div className="flex gap-3">
              <Link href="/book" className="rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-[#2A2A2A] text-center cursor-pointer">
                New Booking
              </Link>
              <button onClick={signOut} className="rounded-sm border border-border px-4 py-2.5 text-sm text-foreground hover:bg-accent cursor-pointer">
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-12 overflow-hidden rounded-sm border border-border bg-card">
            {isLoading ? (
              <div className="p-12 text-center text-ink-muted">Loading…</div>
            ) : !bookings || bookings.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-ink-muted mb-4">No bookings yet.</div>
                <Link href="/book" className="text-sm text-foreground underline hover:text-ink-muted cursor-pointer">
                  Make your first reservation →
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="p-4">Reference</th>
                      <th className="p-4">Pickup</th>
                      <th className="p-4">Route</th>
                      <th className="p-4">Vehicle</th>
                      <th className="p-4">Fare</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b: any, i: number) => (
                      <tr key={b.id} className={i < bookings.length - 1 ? "border-b border-border" : ""}>
                        <td className="p-4 font-mono text-xs text-foreground">{b.reference}</td>
                        <td className="p-4 text-foreground">{new Date(b.pickup_datetime).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td>
                        <td className="p-4 text-ink-muted">
                          <div>{b.pickup_location}</div>
                          <div className="text-ink-soft">→ {b.dropoff_location}</div>
                        </td>
                        <td className="p-4 text-foreground">{b.vehicles?.name ?? "—"}</td>
                        <td className="p-4 text-foreground">${Number(b.fare_estimate).toFixed(2)}</td>
                        <td className="p-4">
                          <StatusBadge status={b.status} />
                          {b.status === "rejected" && b.rejection_reason && (
                            <div className="mt-1 text-xs text-ink-soft">
                              Reason: {b.rejection_reason.replace(/_/g, " ")}
                              {b.rejection_notes ? ` — ${b.rejection_notes}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {b.status !== "cancelled" && b.status !== "completed" && b.status !== "rejected" && (
                            <button onClick={() => cancel(b.id)} className="text-xs text-ink-muted hover:text-foreground cursor-pointer underline">
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
