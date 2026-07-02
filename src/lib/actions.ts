"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { quote, type TripType } from "@/lib/pricing";
import { getDirections } from "@/lib/mapbox";

/** Service-role client — bypasses RLS. Only ever used inside "use server"
 * actions, scoped to the caller's own rows / after an in-code auth check. */
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Recompute a trustworthy fare on the server: never trust the client-sent
 * amount. Reads the vehicle's real rates from the DB, and (when coordinates
 * are present) re-derives the driving distance server-side via Mapbox.
 */
async function computeServerFare(
  admin: ReturnType<typeof getServiceClient>,
  opts: {
    vehicleId: string;
    tripType: TripType;
    durationHours?: number | null;
    pickup?: { lng: number; lat: number } | null;
    dropoff?: { lng: number; lat: number } | null;
    fallbackDistanceKm?: number | null;
  },
): Promise<{ fare: number; distanceKm: number | null; durationMin: number | null }> {
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("base_rate, hourly_rate")
    .eq("id", opts.vehicleId)
    .single();
  if (!vehicle) throw new Error("Vehicle not found");

  let distanceKm: number | null = opts.fallbackDistanceKm ?? null;
  let durationMin: number | null = null;
  if (opts.tripType !== "hourly" && opts.pickup && opts.dropoff) {
    const dir = await getDirections(opts.pickup, opts.dropoff);
    if (dir) { distanceKm = dir.distanceKm; durationMin = dir.durationMin; }
  }

  const fare = quote(opts.tripType, vehicle, {
    durationHours: opts.durationHours ?? undefined,
    distanceKm: distanceKm ?? undefined,
  });
  return { fare, distanceKm, durationMin };
}

function getSupabaseServerClient(session: Session) {
  const token = session.user?.accessToken;
  if (!token) {
    throw new Error("Unauthorized: Access token missing");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  );
}

/** Type-safe helper to get an authenticated session or throw. */
async function requireSession(requiredRole?: string): Promise<Session> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (requiredRole && !session.user.roles?.includes(requiredRole)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return session;
}

export async function createBookingAction(data: {
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
  passengerCount?: number | null;
  luggageCount?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient(session);
  const userId = session.user.id;

  const tripType = data.tripType ?? "one_way";
  // Generated here and returned directly — clients can no longer SELECT the
  // start_otp column, so it must not appear in the returning clause.
  const startOtp = generateOtp();

  // Never trust the client-supplied fare/distance — recompute from DB rates.
  const pricing = await computeServerFare(getServiceClient(), {
    vehicleId: data.vehicleId,
    tripType,
    durationHours: data.durationHours,
    pickup: data.pickupLng != null && data.pickupLat != null ? { lng: data.pickupLng, lat: data.pickupLat } : null,
    dropoff: data.dropoffLng != null && data.dropoffLat != null ? { lng: data.dropoffLng, lat: data.dropoffLat } : null,
    fallbackDistanceKm: data.distanceKm,
  });

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: userId,
      vehicle_id: data.vehicleId,
      pickup_location: data.pickup,
      // Hourly trips have no fixed drop-off; store a clear placeholder.
      dropoff_location: tripType === "hourly" ? (data.dropoff || "As directed (hourly)") : data.dropoff,
      pickup_datetime: new Date(data.datetime).toISOString(),
      fare_estimate: pricing.fare,
      passenger_name: data.passengerName,
      passenger_phone: data.passengerPhone,
      special_requests: data.notes,
      trip_type: tripType,
      duration_hours: tripType === "hourly" ? (data.durationHours ?? null) : null,
      flight_number: tripType === "airport" ? (data.flightNumber ?? null) : null,
      passenger_count: data.passengerCount ?? null,
      luggage_count: data.luggageCount ?? null,
      pickup_lat: data.pickupLat ?? null,
      pickup_lng: data.pickupLng ?? null,
      dropoff_lat: data.dropoffLat ?? null,
      dropoff_lng: data.dropoffLng ?? null,
      distance_km: pricing.distanceKm,
      duration_min: pricing.durationMin ?? data.durationMin ?? null,
      start_otp: startOtp,
      status: "pending",
      payment_status: "pending",
    })
    .select("reference")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  return { reference: booking.reference, start_otp: startOtp };
}

/** 4-digit pickup verification code. */
function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Assigned-driver details for a booking the caller owns. Customers can't read
 * the drivers/profiles tables under RLS, so we use the service role and scope
 * strictly to the caller's own booking.
 */
export async function getBookingDriverAction(bookingId: string) {
  const session = await requireSession();
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: booking } = await admin
    .from("bookings")
    .select("customer_id, driver_id")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (!booking.driver_id) return null;

  const { data: driver } = await admin
    .from("drivers")
    .select("user_id, rating, experience_years")
    .eq("id", booking.driver_id)
    .single();
  if (!driver) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", driver.user_id)
    .single();

  return {
    name: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    rating: driver.rating ?? null,
    experience_years: driver.experience_years ?? null,
  };
}

/**
 * Pickup code for a booking the caller owns. start_otp is not client-readable
 * (column privilege), so the owner fetches it through the service role.
 */
export async function getBookingOtpAction(bookingId: string): Promise<string | null> {
  const session = await requireSession();
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: booking } = await admin
    .from("bookings")
    .select("customer_id, start_otp, status")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (["completed", "cancelled", "rejected"].includes(booking.status)) return null;
  return booking.start_otp ?? null;
}

export async function updateBookingLocationAction(
  bookingId: string,
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
  const session = await requireSession();
  const supabase = getSupabaseServerClient(session);
  const admin = getServiceClient();

  // Load the booking's own vehicle + trip type (server truth), verify ownership
  // and editability, then recompute the fare — never trust a client amount.
  const { data: booking } = await admin
    .from("bookings")
    .select("customer_id, vehicle_id, trip_type, duration_hours, status")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new Error("This booking can no longer be edited.");
  }

  const pricing = await computeServerFare(admin, {
    vehicleId: booking.vehicle_id,
    tripType: booking.trip_type as TripType,
    durationHours: booking.duration_hours,
    pickup: data.pickupLng != null && data.pickupLat != null ? { lng: data.pickupLng, lat: data.pickupLat } : null,
    dropoff: data.dropoffLng != null && data.dropoffLat != null ? { lng: data.dropoffLng, lat: data.dropoffLat } : null,
    fallbackDistanceKm: data.distanceKm,
  });

  const { error } = await supabase
    .from("bookings")
    .update({
      pickup_location: data.pickup,
      dropoff_location: data.dropoff,
      pickup_lat: data.pickupLat,
      pickup_lng: data.pickupLng,
      dropoff_lat: data.dropoffLat,
      dropoff_lng: data.dropoffLng,
      distance_km: pricing.distanceKm,
      duration_min: pricing.durationMin ?? data.durationMin,
      fare_estimate: pricing.fare,
    })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  return { success: true, fare: pricing.fare };
}

export async function cancelBookingAction(bookingId: string) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient(session);

  // Only pre-ride bookings can be cancelled — never one already in progress.
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .in("status", ["pending", "confirmed", "driver_assigned", "accepted"])
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("This ride can no longer be cancelled.");
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateDriverAvailabilityAction(isAvailable: boolean) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);
  const userId = session.user.id;

  // Retrieve driver ID
  const { data: driver, error: driverErr } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (driverErr || !driver) {
    throw new Error("Driver profile not found");
  }

  const { error } = await supabase
    .from("drivers")
    .update({ is_available: isAvailable })
    .eq("id", driver.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/driver");
  return { success: true };
}

export async function verifyDriverAction(driverId: string, verified: boolean) {
  await requireSession("admin");
  // is_verified is a privileged column (revoked from the authenticated role),
  // so this write goes through the service role after the admin gate above.
  const admin = getServiceClient();

  const { error } = await admin
    .from("drivers")
    .update({ is_verified: verified })
    .eq("id", driverId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function confirmBookingAction(bookingId: string) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase
    .from("bookings")
    .update({ status: "confirmed" as any })
    .eq("id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function rejectBookingAction(bookingId: string, reason: string, notes: string | null) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "rejected" as any,
      rejection_reason: reason,
      rejection_notes: notes || null,
    } as any)
    .eq("id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function assignDriverAction(bookingId: string, driverId: string) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase
    .from("bookings")
    .update({ driver_id: driverId, status: "driver_assigned" as any })
    .eq("id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function acceptRideAction(rideId: string) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "accepted" })
    .eq("id", rideId)
    .eq("status", "driver_assigned")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("This ride is no longer awaiting acceptance.");
  }

  revalidatePath("/driver");
  return { success: true };
}

export async function declineRideAction(rideId: string) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase.rpc("driver_decline_ride", { _booking_id: rideId });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/driver");
  return { success: true };
}

export async function startRideAction(rideId: string, otp: string) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);

  // Atomic SECURITY DEFINER RPC: verifies assigned driver + startable status +
  // pickup code, then flips to in_progress. Clients can't read start_otp.
  // Soft failures (wrong code / attempt lockout) come back in the result so
  // the attempt counter survives — a raised exception would roll it back.
  const { data, error } = await supabase.rpc("start_ride_with_otp", {
    _booking_id: rideId,
    _otp: String(otp).trim(),
  });

  if (error) {
    throw new Error(error.message);
  }
  const result = data as { ok: boolean; error?: string } | null;
  if (!result?.ok) {
    throw new Error(result?.error ?? "Failed to start ride");
  }

  revalidatePath("/driver");
  return { success: true };
}

export async function completeRideAction(rideId: string) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);
  const userId = session.user.id;

  // Retrieve driver ID
  const { data: driver, error: driverErr } = await supabase
    .from("drivers")
    .select("id, total_earnings")
    .eq("user_id", userId)
    .single();

  if (driverErr || !driver) {
    throw new Error("Driver profile not found");
  }

  // Complete only an in-progress ride, and read its fare from the DB in the
  // same statement — the client no longer supplies the fare (was tamperable).
  // payment_status stays "pending" — payment collection isn't wired yet.
  const { data: updated, error: bookingErr } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", rideId)
    .eq("status", "in_progress")
    .select("id, fare_estimate");

  if (bookingErr) {
    throw new Error(bookingErr.message);
  }
  if (!updated || updated.length === 0) {
    throw new Error("Only a ride in progress can be completed.");
  }

  // Earnings from the server-side fare (80%). total_earnings is a privileged
  // column revoked from authenticated, so credit it via the service role.
  const earningsIncrease = Number(updated[0].fare_estimate ?? 0) * 0.8;
  const newEarnings = Number(driver.total_earnings ?? 0) + earningsIncrease;

  const { error: driverUpdateErr } = await getServiceClient()
    .from("drivers")
    .update({ total_earnings: newEarnings })
    .eq("id", driver.id);

  if (driverUpdateErr) {
    throw new Error(driverUpdateErr.message);
  }

  revalidatePath("/driver");
  return { success: true };
}
