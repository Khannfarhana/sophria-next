"use client";

/**
 * Shared data layer for the admin console: row types, query hooks, and
 * mutation helpers. Every /admin/* page reads through here so the queries,
 * cache keys, and mock/Supabase switching live in exactly one place.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSupabase } from "@/hooks/use-supabase";
import type { Database } from "@/integrations/supabase/types";
import {
  verifyDriverAction,
  declineDriverApplicationAction,
  nudgeDriverApplicantAction,
  confirmBookingAction,
  rejectBookingAction,
  assignDriverAction,
  setDriverCommissionAction,
  updateBookingFareAction,
} from "@/lib/actions";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import {
  mockAdminBookings,
  mockAdminDrivers,
  mockAdminVehicles,
  mockAdminKpi,
  mockVerifyDriver,
  mockConfirmBooking,
  mockRejectBooking,
  mockAssignDriver,
  mockSetDriverCommission,
  mockUpdateBookingFare,
} from "@/lib/mock-db/actions";

export interface AdminBooking {
  id: string;
  reference: string;
  customer_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  pickup_location: string;
  dropoff_location: string;
  pickup_datetime: string;
  status: string;
  payment_status: string;
  fare_estimate: number;
  driver_payout: number | null;
  tip: number;
  payment_mode?: string | null;
  deposit_amount?: number | null;
  balance_due?: number | null;
  balance_paid_at?: string | null;
  balance_method?: string | null;
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

export interface AdminDriver {
  id: string;
  user_id: string;
  application_type: string | null;
  license_number: string;
  experience_years: number;
  is_available: boolean;
  is_verified: boolean;
  rating: number;
  commission_rate: number;
  total_earnings: number;
  created_at: string;
  city_of_residence: string | null;
  province: string | null;
  work_authorization: string | null;
  languages_spoken: string | null;
  time_availability: string | null;
  referral_name: string | null;
  photo_url: string | null;
  licence_class: string | null;
  limo_plate: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_class: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export const REJECT_REASONS = [
  { v: "no_drivers", l: "No drivers available" },
  { v: "customer_request", l: "Customer request" },
  { v: "payment_issue", l: "Payment issue" },
  { v: "other", l: "Other" },
];

export function useAdminBookings(filter: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["admin-bookings", filter],
    refetchInterval: 30_000, // new bookings appear without a manual reload
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminBookings(filter) as Promise<AdminBooking[]>;
      // Explicit columns — start_otp is not client-readable (column privilege).
      let q = supabase
        .from("bookings")
        .select("id, reference, customer_id, driver_id, vehicle_id, trip_type, pickup_location, dropoff_location, pickup_datetime, duration_hours, flight_number, passenger_count, luggage_count, fare_estimate, driver_payout, tip, payment_mode, deposit_amount, balance_due, balance_paid_at, balance_method, passenger_name, passenger_phone, special_requests, status, payment_status, rejection_reason, rejection_notes, created_at, updated_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, vehicles(name)")
        .order("created_at", { ascending: false })
        // Window: the overview's queues read from this. Older items stay
        // reachable through the per-status filters on /admin/bookings.
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((b: any) => ({
        ...b,
        customer: profilesById[b.customer_id] ?? null,
        driver: b.driver_id ? driversById[b.driver_id] ?? null : null,
      })) as AdminBooking[];
    },
  });
}

export function useAdminDrivers() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminDrivers() as Promise<AdminDriver[]>;
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
}

/** An in-progress /become-chauffeur application: someone who started but hasn't submitted. */
export interface AdminDriverDraft {
  user_id: string;
  application_type: string;
  stage: string;
  form: Record<string, string> | null;
  photo_path: string | null;
  doc_paths: Record<string, { path: string; name: string }> | null;
  nudged_at: string | null;
  created_at: string;
  updated_at: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export function useAdminDriverDrafts() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["admin-driver-drafts"],
    refetchInterval: 30_000, // funnel view stays fresh alongside the KPIs
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return [] as AdminDriverDraft[];
      const { data } = await supabase
        .from("driver_application_drafts")
        .select("user_id, application_type, stage, form, photo_path, doc_paths, nudged_at, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (!data) return [];
      const ids = data.map((d) => d.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", ids)
        : { data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] };
      const byId = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      // form/doc_paths come back as generic Json; the draft writer (become-chauffeur) owns the shape.
      return data.map((d) => ({ ...d, profile: byId[d.user_id] ?? null })) as unknown as AdminDriverDraft[];
    },
  });
}

export function useAdminVehicles() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["admin-vehicles"],
    queryFn: async () => {
      if (!SUPABASE_ENABLED) return mockAdminVehicles();
      return (await supabase.from("vehicles").select("*").order("sort_order").order("base_rate")).data;
    },
  });
}

export function useAdminKpi() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["admin-kpi"],
    refetchInterval: 30_000, // keep pace with the bookings list
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
}

/** Mutation helpers with cache invalidation + toasts, shared by every page. */
export function useAdminActions() {
  const qc = useQueryClient();

  const confirmBooking = async (b: Pick<AdminBooking, "id" | "reference">) => {
    try {
      if (SUPABASE_ENABLED) await confirmBookingAction(b.id);
      else await mockConfirmBooking(b.id);
      toast.success(`Booking ${b.reference} confirmed`);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-kpi"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm booking");
    }
  };

  const rejectBooking = async (b: Pick<AdminBooking, "id" | "reference">, reason: string, notes: string | null) => {
    if (SUPABASE_ENABLED) await rejectBookingAction(b.id, reason, notes);
    else await mockRejectBooking(b.id, reason, notes);
    toast.success(`Booking ${b.reference} rejected`);
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  };

  const updateFare = async (b: Pick<AdminBooking, "id" | "reference" | "status">, amount: number, reason: string) => {
    if (SUPABASE_ENABLED) await updateBookingFareAction(b.id, amount, reason);
    else await mockUpdateBookingFare(b.id, amount, reason);
    toast.success(
      b.status === "confirmed"
        ? `Fare updated for ${b.reference} — payment request re-sent`
        : `Fare updated for ${b.reference} — included when you confirm`,
    );
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    // Monthly revenue on the overview sums fare_estimate — keep it honest.
    qc.invalidateQueries({ queryKey: ["admin-kpi"] });
  };

  const assignDriver = async (b: Pick<AdminBooking, "id" | "reference">, driverId: string, payout: number) => {
    if (SUPABASE_ENABLED) await assignDriverAction(b.id, driverId, payout);
    else await mockAssignDriver(b.id, driverId, payout);
    toast.success(`Driver assigned to ${b.reference} — payout $${payout.toFixed(2)}`);
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  };

  const verifyDriver = async (id: string, val: boolean) => {
    try {
      if (SUPABASE_ENABLED) await verifyDriverAction(id, val);
      else await mockVerifyDriver(id, val);
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      qc.invalidateQueries({ queryKey: ["admin-kpi"] });
      toast.success("Updated driver status");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to verify driver");
    }
  };

  const setCommission = async (driverId: string, rate: number) => {
    if (SUPABASE_ENABLED) await setDriverCommissionAction(driverId, rate);
    else await mockSetDriverCommission(driverId, rate);
    qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    toast.success("Commission updated");
  };

  /** Decline a pending application: removes it and emails the applicant. */
  const declineApplication = async (driverId: string) => {
    try {
      if (SUPABASE_ENABLED) await declineDriverApplicationAction(driverId);
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      qc.invalidateQueries({ queryKey: ["admin-kpi"] });
      toast.success("Application declined — the applicant has been emailed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to decline application");
      throw err;
    }
  };

  /** Email an in-progress applicant a reminder to finish (24h cooldown server-side). */
  const nudgeApplicant = async (userId: string) => {
    try {
      if (SUPABASE_ENABLED) await nudgeDriverApplicantAction(userId);
      qc.invalidateQueries({ queryKey: ["admin-driver-drafts"] });
      toast.success("Reminder sent");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send reminder");
    }
  };

  return { confirmBooking, rejectBooking, updateFare, assignDriver, verifyDriver, setCommission, declineApplication, nudgeApplicant };
}
