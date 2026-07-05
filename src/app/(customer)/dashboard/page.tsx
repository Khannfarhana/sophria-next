"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, CalendarClock, Car } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { BookingDetailDialog, type BookingRow } from "@/components/site/BookingDetailDialog";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { StatusBadge } from "@/components/site/StatusBadge";
import { cancelBookingAction } from "@/lib/actions";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { mockBookingsForCustomer, mockCancelBooking } from "@/lib/mock-db/actions";

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
  const [selected, setSelected] = useState<BookingRow | null>(null);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000, // driver assignment / status changes appear live
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockBookingsForCustomer(user!.id);
      // Explicit columns — start_otp is not client-readable (column privilege);
      // the detail dialog fetches it via getBookingOtpAction.
      const { data, error } = await supabase
        .from("bookings")
        .select("id, reference, customer_id, driver_id, vehicle_id, trip_type, pickup_location, dropoff_location, pickup_datetime, duration_hours, flight_number, fare_estimate, passenger_name, passenger_phone, special_requests, status, payment_status, rejection_reason, rejection_notes, created_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, vehicles(name, type, base_rate, hourly_rate)")
        .order("pickup_datetime", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []).map((b) => {
        const vehicles = Array.isArray(b.vehicles) ? (b.vehicles[0] ?? null) : (b.vehicles ?? null);
        return {
          ...b,
          vehicles,
        };
      });
      return rows as BookingRow[];
    },
  });

  const cancel = async (id: string) => {
    try {
      if (SUPABASE_ENABLED) await cancelBookingAction(id);
      else await mockCancelBooking(id);
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel booking");
    }
  };

  return (
    <SiteLayout solidNav>
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

          <div className="mt-10">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-52 animate-pulse rounded-2xl border border-border bg-card" />
                ))}
              </div>
            ) : !bookings || bookings.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-16 text-center">
                <div className="text-ink-muted mb-4">No bookings yet.</div>
                <Link href="/book" className="text-sm text-foreground underline hover:text-ink-muted cursor-pointer">
                  Make your first reservation →
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {bookings.map((b: BookingRow) => {
                  // Pre-ride only — an in-progress ride can't be cancelled from here.
                  const cancellable = ["pending", "confirmed", "driver_assigned", "accepted"].includes(b.status);
                  return (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(b)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(b); } }}
                      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_20px_44px_-26px_rgba(0,0,0,0.45)]"
                    >
                      <span className="absolute inset-y-0 left-0 w-[3px] bg-[#c9a76a] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs tracking-wide text-ink-soft">{b.reference}</div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-foreground">
                            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                            <span className="truncate">
                              {formatDateTime(b.pickup_datetime)}
                            </span>
                          </div>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>

                      {/* Route */}
                      <div className="mt-4">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#3fae6b] ring-2 ring-[#3fae6b]/20" />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-soft">Pickup</div>
                            <div className="truncate text-sm text-foreground">{b.pickup_location}</div>
                          </div>
                        </div>
                        <div className="ml-[3px] my-1 h-3 w-px bg-border" />
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c9a76a] ring-2 ring-[#c9a76a]/20" />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-soft">Drop-off</div>
                            <div className="truncate text-sm text-foreground">{b.dropoff_location}</div>
                          </div>
                        </div>
                      </div>

                      {b.status === "rejected" && b.rejection_reason && (
                        <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-ink-soft">
                          Reason: {b.rejection_reason.replace(/_/g, " ")}
                          {b.rejection_notes ? ` — ${b.rejection_notes}` : ""}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                        <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
                          <Car className="h-4 w-4 shrink-0" />
                          <span className="truncate">{b.vehicles?.name ?? "—"}</span>
                        </div>
                        <div className="font-display text-xl text-foreground">${Number(b.fare_estimate).toFixed(2)}</div>
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex items-center justify-between">
                        {cancellable ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancel(b.id); }}
                            className="cursor-pointer text-xs text-ink-soft underline underline-offset-2 hover:text-foreground"
                          >
                            Cancel booking
                          </button>
                        ) : <span />}
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted transition-colors group-hover:text-foreground">
                          View details
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {bookings && bookings.length > 0 && (
            <p className="mt-4 text-xs text-ink-soft">Tap a booking to view its route map and edit pickup or drop-off.</p>
          )}
        </div>
      </section>

      <BookingDetailDialog
        booking={selected ? (bookings?.find((x: BookingRow) => x.id === selected.id) ?? selected) : null}
        open={!!selected}
        onClose={() => setSelected(null)}
        onUpdated={() => qc.invalidateQueries({ queryKey: ["my-bookings"] })}
      />
    </SiteLayout>
  );
}
