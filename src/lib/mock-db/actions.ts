"use server";

/**
 * Server actions that read/write the file-backed mock DB. Used by the app
 * whenever Supabase is not configured (demo / local preview), so the whole
 * app is browsable and every mutation persists to disk like a real DB.
 *
 * Mirrors the shapes returned by the equivalent Supabase queries (incl. the
 * client-side hydration the pages used to do) so callers can swap 1:1.
 */
import { readDB, mutateDB, newId, newReference } from "./store";
import { quote, type TripType } from "@/lib/pricing";
import { toStorageIso } from "@/lib/datetime";
import type { Booking } from "@/data/data";

const now = () => new Date().toISOString();

/* ----------------------------- reads ----------------------------- */

export async function mockActiveVehicles() {
  return readDB()
    .vehicles.filter((v) => v.is_active)
    .sort((a, b) => Number(a.base_rate) - Number(b.base_rate));
}

export async function mockBookingsForCustomer(customerId: string) {
  const db = readDB();
  const vById = new Map(db.vehicles.map((v) => [v.id, v]));
  return db.bookings
    .filter((b) => b.customer_id === customerId)
    .sort((a, b) => +new Date(b.pickup_datetime) - +new Date(a.pickup_datetime))
    .map((b) => ({ ...b, vehicles: b.vehicle_id ? { name: vById.get(b.vehicle_id)?.name ?? null } : null }));
}

export async function mockDriverByUserId(userId: string) {
  return readDB().drivers.find((d) => d.user_id === userId) ?? null;
}

export async function mockRidesForDriver(driverId: string) {
  const db = readDB();
  const vById = new Map(db.vehicles.map((v) => [v.id, v]));
  return db.bookings
    .filter((b) => b.driver_id === driverId)
    .sort((a, b) => +new Date(a.pickup_datetime) - +new Date(b.pickup_datetime))
    .map((b) => ({ ...b, vehicles: b.vehicle_id ? { name: vById.get(b.vehicle_id)?.name ?? null } : null }));
}

export async function mockAdminBookings(filter = "all") {
  const db = readDB();
  const vById = new Map(db.vehicles.map((v) => [v.id, v]));
  const pById = new Map(db.profiles.map((p) => [p.id, p]));
  const dById = new Map(db.drivers.map((d) => [d.id, d]));
  let rows = [...db.bookings].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  if (filter !== "all") rows = rows.filter((b) => b.status === filter);
  return rows.slice(0, 50).map((b) => {
    const driver = b.driver_id ? dById.get(b.driver_id) : null;
    return {
      ...b,
      vehicles: b.vehicle_id ? { name: vById.get(b.vehicle_id)?.name ?? null } : null,
      customer: pById.get(b.customer_id) ?? null,
      driver: driver ? { ...driver, profile: pById.get(driver.user_id) ?? null } : null,
    };
  });
}

export async function mockAdminDrivers() {
  const db = readDB();
  const pById = new Map(db.profiles.map((p) => [p.id, p]));
  return [...db.drivers]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((d) => ({ ...d, profile: pById.get(d.user_id) ?? null }));
}

export async function mockAdminVehicles() {
  return [...readDB().vehicles].sort((a, b) => Number(a.base_rate) - Number(b.base_rate));
}

export async function mockAdminKpi() {
  const db = readDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return {
    todays: db.bookings.filter((b) => +new Date(b.created_at) >= +today).length,
    active: db.drivers.filter((d) => d.is_available && d.is_verified).length,
    revenue: db.bookings
      .filter((b) => +new Date(b.created_at) >= +monthStart)
      .reduce((s, b) => s + Number(b.fare_estimate ?? 0), 0),
    pending: db.drivers.filter((d) => !d.is_verified).length,
  };
}

export async function mockAdminWeekly() {
  const db = readDB();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const buckets: Record<string, { week: string; bookings: number; revenue: number }> = {};
  db.bookings
    .filter((b) => +new Date(b.created_at) >= +start)
    .forEach((b) => {
      const d = new Date(b.created_at);
      const wk = `W${Math.ceil(d.getDate() / 7)}`;
      if (!buckets[wk]) buckets[wk] = { week: wk, bookings: 0, revenue: 0 };
      buckets[wk].bookings += 1;
      buckets[wk].revenue += Number(b.fare_estimate ?? 0);
    });
  return Object.values(buckets);
}

/* ----------------------------- writes ---------------------------- */

function patchBooking(id: string, patch: Partial<Booking>) {
  mutateDB((db) => {
    const b = db.bookings.find((x) => x.id === id);
    if (b) Object.assign(b, patch, { updated_at: now() });
  });
}

export async function mockCreateBooking(input: {
  customerId: string;
  vehicleId: string;
  pickup: string;
  dropoff: string;
  datetime: string;
  fare: number;
  passengerName: string;
  passengerPhone: string;
  notes: string;
  tripType?: "one_way" | "hourly" | "airport";
  durationHours?: number | null;
  flightNumber?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
}) {
  const reference = newReference();
  const tt = input.tripType ?? "one_way";
  const startOtp = String(Math.floor(1000 + Math.random() * 9000));
  mutateDB((db) => {
    db.bookings.unshift({
      id: newId(),
      reference,
      start_otp: startOtp,
      otp_attempts: 0,
      otp_last_attempt_at: null,
      customer_id: input.customerId,
      driver_id: null,
      vehicle_id: input.vehicleId,
      trip_type: tt,
      pickup_location: input.pickup,
      dropoff_location: tt === "hourly" ? input.dropoff || "As directed (hourly)" : input.dropoff,
      pickup_datetime: toStorageIso(input.datetime),
      duration_hours: tt === "hourly" ? input.durationHours ?? null : null,
      flight_number: tt === "airport" ? input.flightNumber ?? null : null,
      passenger_count: null,
      luggage_count: null,
      pickup_lat: input.pickupLat ?? null,
      pickup_lng: input.pickupLng ?? null,
      dropoff_lat: input.dropoffLat ?? null,
      dropoff_lng: input.dropoffLng ?? null,
      distance_km: input.distanceKm ?? null,
      duration_min: input.durationMin ?? null,
      fare_estimate: input.fare,
      passenger_name: input.passengerName,
      passenger_phone: input.passengerPhone,
      special_requests: input.notes || null,
      status: "pending",
      payment_status: "pending",
      stripe_payment_id: null,
      rejection_reason: null,
      rejection_notes: null,
      created_at: now(),
      updated_at: now(),
    });
  });
  return { reference, start_otp: startOtp };
}

const CANCELLABLE = new Set(["pending", "confirmed", "driver_assigned", "accepted"]);

export async function mockCancelBooking(id: string) {
  const booking = readDB().bookings.find((b) => b.id === id);
  if (!booking || !CANCELLABLE.has(booking.status)) {
    throw new Error("This ride can no longer be cancelled.");
  }
  patchBooking(id, { status: "cancelled" });
  return { success: true };
}

export async function mockBookingOtp(bookingId: string): Promise<string | null> {
  const booking = readDB().bookings.find((b) => b.id === bookingId);
  if (!booking || ["completed", "cancelled", "rejected"].includes(booking.status)) return null;
  return booking.start_otp ?? null;
}

export async function mockBookingDriver(bookingId: string) {
  const db = readDB();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking?.driver_id) return null;
  const driver = db.drivers.find((d) => d.id === booking.driver_id);
  if (!driver) return null;
  const profile = db.profiles.find((p) => p.id === driver.user_id);
  return {
    name: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    rating: driver.rating ?? null,
    experience_years: driver.experience_years ?? null,
  };
}

export async function mockUpdateBookingLocation(
  id: string,
  data: {
    pickup: string;
    dropoff: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffLat: number | null;
    dropoffLng: number | null;
    distanceKm: number | null;
    durationMin: number | null;
  },
) {
  // Recompute the fare from the booking's vehicle rates (no client fare).
  const db = readDB();
  const booking = db.bookings.find((b) => b.id === id);
  const vehicle = booking ? db.vehicles.find((v) => v.id === booking.vehicle_id) : null;
  const fare = vehicle
    ? quote((booking!.trip_type as TripType) ?? "one_way", vehicle, {
        durationHours: booking!.duration_hours ?? undefined,
        distanceKm: data.distanceKm ?? undefined,
      })
    : Number(booking?.fare_estimate ?? 0);

  patchBooking(id, {
    pickup_location: data.pickup,
    dropoff_location: data.dropoff,
    pickup_lat: data.pickupLat,
    pickup_lng: data.pickupLng,
    dropoff_lat: data.dropoffLat,
    dropoff_lng: data.dropoffLng,
    distance_km: data.distanceKm,
    duration_min: data.durationMin,
    fare_estimate: fare,
  });
  return { success: true, fare };
}

export async function mockConfirmBooking(id: string) {
  patchBooking(id, { status: "confirmed" });
  return { success: true };
}

export async function mockRejectBooking(id: string, reason: string, notes: string | null) {
  patchBooking(id, { status: "rejected", rejection_reason: reason, rejection_notes: notes || null });
  return { success: true };
}

export async function mockAssignDriver(id: string, driverId: string) {
  patchBooking(id, { driver_id: driverId, status: "driver_assigned" });
  return { success: true };
}

export async function mockVerifyDriver(driverId: string, verified: boolean) {
  mutateDB((db) => {
    const d = db.drivers.find((x) => x.id === driverId);
    if (d) {
      d.is_verified = verified;
      d.updated_at = now();
    }
  });
  return { success: true };
}

export async function mockSetDriverAvailability(driverId: string, isAvailable: boolean) {
  mutateDB((db) => {
    const d = db.drivers.find((x) => x.id === driverId);
    if (d) {
      d.is_available = isAvailable;
      d.updated_at = now();
    }
  });
  return { success: true };
}

export async function mockAcceptRide(id: string) {
  const booking = readDB().bookings.find((b) => b.id === id);
  if (booking?.status !== "driver_assigned") {
    throw new Error("This ride is no longer awaiting acceptance.");
  }
  patchBooking(id, { status: "accepted" });
  return { success: true };
}

export async function mockDeclineRide(id: string) {
  const booking = readDB().bookings.find((b) => b.id === id);
  if (booking?.status !== "driver_assigned") {
    throw new Error("This ride is no longer awaiting acceptance.");
  }
  // Back to dispatch: admin already confirmed it, so it returns unassigned
  // to "confirmed" (matches the driver_decline_ride RPC), not "pending".
  patchBooking(id, { status: "confirmed", driver_id: null });
  return { success: true };
}

const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 10 * 60_000;

export async function mockStartRide(id: string, otp: string) {
  const booking = readDB().bookings.find((b) => b.id === id);
  if (!booking || !["accepted", "confirmed", "driver_assigned"].includes(booking.status)) {
    throw new Error("Ride cannot be started from its current state.");
  }
  if (!booking.start_otp) throw new Error("No pickup code set for this ride.");

  // 5 wrong attempts locks the code for 10 minutes (mirrors start_ride_with_otp).
  const windowExpired =
    !booking.otp_last_attempt_at || Date.now() - +new Date(booking.otp_last_attempt_at) > OTP_WINDOW_MS;
  const attempts = windowExpired ? 0 : booking.otp_attempts ?? 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw new Error("Too many incorrect attempts. Try again in about 10 minutes.");
  }

  if (String(otp).trim() !== String(booking.start_otp)) {
    const next = attempts + 1;
    patchBooking(id, { otp_attempts: next, otp_last_attempt_at: now() });
    const left = OTP_MAX_ATTEMPTS - next;
    throw new Error(
      left <= 0
        ? "Too many incorrect attempts. Try again in about 10 minutes."
        : `Incorrect pickup code — ${left} attempt${left === 1 ? "" : "s"} remaining.`,
    );
  }

  patchBooking(id, { status: "in_progress", otp_attempts: 0, otp_last_attempt_at: null });
  return { success: true };
}

export async function mockCompleteRide(id: string, fare: number) {
  const booking = readDB().bookings.find((b) => b.id === id);
  if (booking?.status !== "in_progress") {
    throw new Error("Only a ride in progress can be completed.");
  }
  mutateDB((db) => {
    const b = db.bookings.find((x) => x.id === id);
    if (!b) return;
    b.status = "completed";
    b.payment_status = "paid";
    b.updated_at = now();
    const d = b.driver_id ? db.drivers.find((x) => x.id === b.driver_id) : null;
    if (d) d.total_earnings = Number(d.total_earnings) + Number(fare || b.fare_estimate || 0);
  });
  return { success: true };
}
