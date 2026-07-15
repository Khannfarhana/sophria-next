"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Session } from "next-auth";
import {
  priceBreakdown,
  round2,
  HST_RATE,
  DEFAULT_DRIVER_PAYOUT_RATE,
  type FareBreakdown,
  type TripType,
} from "@/lib/pricing";
import { resolvePearsonTariff } from "@/lib/tariff";
import { getDirections } from "@/lib/mapbox";
import { toStorageIso } from "@/lib/datetime";
import {
  notifyBookingCreated,
  notifyBookingConfirmed,
  notifyBookingRejected,
  notifyDriverAssigned,
  notifyDriverAccepted,
  notifyDriverDeclined,
  notifyRideCompleted,
  notifyBookingCancelled,
  notifyDriverApplication,
} from "@/lib/mailer/notifications";
import { expireOpenCheckoutSessions } from "@/lib/payments";

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
    pickupText?: string | null;
    dropoffText?: string | null;
    passengerCount?: number | null;
  },
): Promise<{ breakdown: FareBreakdown; distanceKm: number | null; durationMin: number | null }> {
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("base_rate, hourly_rate, type")
    .eq("id", opts.vehicleId)
    .single();
  if (!vehicle) throw new Error("Vehicle not found");

  let distanceKm: number | null = opts.fallbackDistanceKm ?? null;
  let durationMin: number | null = null;
  if (opts.tripType !== "hourly" && opts.pickup && opts.dropoff) {
    const dir = await getDirections(opts.pickup, opts.dropoff);
    if (dir) { distanceKm = dir.distanceKm; durationMin = dir.durationMin; }
  }

  // Pearson airport trips are priced by the official GTAA tariff.
  const tariff =
    opts.tripType === "airport"
      ? resolvePearsonTariff({
          pickup: opts.pickupText,
          dropoff: opts.dropoffText,
          pickupCoords: opts.pickup ?? undefined,
          dropoffCoords: opts.dropoff ?? undefined,
          distanceKm,
        })
      : null;

  const breakdown = priceBreakdown(opts.tripType, vehicle, {
    durationHours: opts.durationHours ?? undefined,
    distanceKm: distanceKm ?? undefined,
    tariff,
    passengerCount: opts.passengerCount,
  });
  return { breakdown, distanceKm, durationMin };
}

/** Fare columns for a booking insert/update, from a computed breakdown. */
function fareColumns(b: FareBreakdown) {
  return {
    fare_estimate: b.subtotal,
    base_fare: b.baseFare,
    markup_amount: b.markup,
    airport_fee: b.airportFee,
    tax_amount: b.hst,
  };
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
    pickupText: data.pickup,
    dropoffText: data.dropoff,
    passengerCount: data.passengerCount,
  });

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: userId,
      vehicle_id: data.vehicleId,
      pickup_location: data.pickup,
      // Hourly trips have no fixed drop-off; store a clear placeholder.
      dropoff_location: tripType === "hourly" ? (data.dropoff || "As directed (hourly)") : data.dropoff,
      // Store the exact picked wall clock (as UTC) — no timezone conversion.
      pickup_datetime: toStorageIso(data.datetime),
      ...fareColumns(pricing.breakdown),
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
    .select("id, reference")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  after(() => notifyBookingCreated(booking.id));
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
  const admin = getServiceClient();

  // Load the booking's own vehicle + trip type (server truth), verify ownership
  // and editability, then recompute the fare — never trust a client amount.
  const { data: booking } = await admin
    .from("bookings")
    .select("customer_id, vehicle_id, trip_type, duration_hours, status, passenger_count")
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
    pickupText: data.pickup,
    dropoffText: data.dropoff,
    passengerCount: booking.passenger_count,
  });

  // Service client, not the caller's: the fare columns are guarded by
  // prevent_booking_payout_tamper, which only exempts admins and the service
  // role. Ownership and editability are verified above.
  const { error } = await admin
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
      ...fareColumns(pricing.breakdown),
    })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  return { success: true, fare: pricing.breakdown.subtotal };
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

  after(() => notifyBookingCancelled(bookingId));
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
  // is_verified / role are privileged; both go through the service role after
  // the admin gate. Approving here is what GRANTS the 'driver' role — a
  // successful /become-chauffeur application only creates a pending record.
  const admin = getServiceClient();

  const { data: driver, error } = await admin
    .from("drivers")
    .update({ is_verified: verified, is_available: verified })
    .eq("id", driverId)
    .select("user_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (driver?.user_id) {
    if (verified) {
      await admin.from("user_roles").upsert({ user_id: driver.user_id, role: "driver" }, { onConflict: "user_id,role" });
    } else {
      await admin.from("user_roles").delete().eq("user_id", driver.user_id).eq("role", "driver");
    }
  }

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Public chauffeur application. Requires sign-in (to link the account), but the
 * applicant is NOT granted the driver role — this creates a PENDING record only.
 * Runs via the service role so it works before the user is a driver, and so the
 * applicant can't set privileged fields (is_verified stays false).
 */
export async function submitDriverApplicationAction(data: {
  fullName: string;
  phone: string;
  license: string;
  experience: number;
  city: string;
  province: string;
  workAuthorization: string;
  languages: string;
  referral: string | null;
  availability: string;
  photoPath: string | null;
  docs: { docType: string; path: string }[];
}) {
  const session = await requireSession();
  const admin = getServiceClient();
  const userId = session.user.id;

  const { data: driver, error } = await admin
    .from("drivers")
    .upsert({
      user_id: userId,
      license_number: data.license,
      experience_years: data.experience,
      city_of_residence: data.city,
      province: data.province,
      work_authorization: data.workAuthorization,
      languages_spoken: data.languages,
      time_availability: data.availability,
      referral_name: data.referral || null,
      photo_url: data.photoPath,
      is_verified: false,
      is_available: false,
    }, { onConflict: "user_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin.from("profiles").update({ full_name: data.fullName, phone: data.phone }).eq("id", userId);

  for (const d of data.docs) {
    if (d.path) await admin.from("driver_documents").insert({ driver_id: driver.id, doc_type: d.docType, file_url: d.path });
  }

  after(() => notifyDriverApplication(data.fullName || "there", session.user.email ?? ""));
  revalidatePath("/admin");
  return { success: true };
}

export async function updateBookingFareAction(bookingId: string, fare: number, reason: string) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  const newFare = Math.round(Number(fare) * 100) / 100;
  if (!Number.isFinite(newFare) || newFare <= 0) {
    throw new Error("Enter a valid fare amount.");
  }
  if (!reason?.trim()) {
    throw new Error("A reason for the fare change is required.");
  }

  // Capture the current fare for the customer email.
  const { data: booking } = await supabase
    .from("bookings")
    .select("fare_estimate")
    .eq("id", bookingId)
    .single();
  if (!booking) throw new Error("Booking not found");
  const oldFare = Number(booking.fare_estimate);

  // Fares are only adjustable before the customer has paid (pre-assignment,
  // so the driver-payout snapshot can never go stale either). The change and
  // its reason are stored on the booking and communicated inside the
  // payment-request email — never as a separate fare email.
  //
  // An override replaces the whole pre-tax subtotal with a negotiated price, so
  // the computed breakdown no longer describes it: base_fare becomes the quoted
  // figure and the markup/airport lines collapse into it. HST is always
  // recomputed — leaving stale tax here would charge the wrong total.
  const { data, error } = await supabase
    .from("bookings")
    .update({
      fare_estimate: newFare,
      base_fare: newFare,
      markup_amount: 0,
      airport_fee: 0,
      tax_amount: round2(newFare * HST_RATE),
      previous_fare: oldFare,
      fare_change_reason: reason.trim(),
    })
    .eq("id", bookingId)
    .in("status", ["pending", "confirmed"])
    .eq("payment_status", "pending")
    .select("id, status");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("The fare can only be changed before the booking is paid.");
  }

  // Pending: silent — the fare change rides along in the payment-request
  // email when the admin confirms. Already confirmed (awaiting payment):
  // re-send the payment request with the updated fare + reason, and kill any
  // checkout session opened at the old amount.
  if (data[0].status === "confirmed") {
    after(() => {
      expireOpenCheckoutSessions(bookingId);
      notifyBookingConfirmed(bookingId);
    });
  }
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function confirmBookingAction(bookingId: string) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  // Guarded update: only a pending booking can be confirmed (prevents
  // double-confirm/double-email and confirming a cancelled booking).
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "confirmed" as any })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("Only a pending booking can be confirmed.");
  }

  after(() => notifyBookingConfirmed(bookingId));
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

  after(() => notifyBookingRejected(bookingId));
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function assignDriverAction(
  bookingId: string,
  driverId: string,
  payoutOverride?: number | null,
) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  // Snapshot the payout for THIS ride: the admin can override it at assign
  // time; otherwise it defaults to fare × the driver's commission rate. Safe
  // from staleness: fares are only editable while pending/confirmed, and this
  // update flips the booking to driver_assigned. Reassignment re-runs this
  // path (fresh default or a new override).
  let payout: number;
  if (payoutOverride != null) {
    payout = Math.round(Number(payoutOverride) * 100) / 100;
    if (!Number.isFinite(payout) || payout < 0) {
      throw new Error("Enter a valid driver payout.");
    }
  } else {
    const { data: drv, error: drvErr } = await supabase
      .from("drivers")
      .select("commission_rate")
      .eq("id", driverId)
      .single();
    if (drvErr || !drv) throw new Error("Driver not found");

    const { data: bk, error: bkErr } = await supabase
      .from("bookings")
      .select("fare_estimate")
      .eq("id", bookingId)
      .single();
    if (bkErr || !bk) throw new Error("Booking not found");

    payout = Math.round(Number(bk.fare_estimate) * Number(drv.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100) / 100;
  }

  // Payment wall: a driver can be assigned (or reassigned, pre-ride) only
  // once the customer has paid the full fare.
  const { data, error } = await supabase
    .from("bookings")
    .update({ driver_id: driverId, status: "driver_assigned" as any, driver_payout: payout })
    .eq("id", bookingId)
    .in("status", ["confirmed", "driver_assigned", "accepted"])
    .eq("payment_status", "paid")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("A driver can only be assigned after the customer has paid.");
  }

  after(() => notifyDriverAssigned(bookingId));
  revalidatePath("/admin");
  return { success: true };
}

export async function setDriverCommissionAction(driverId: string, rate: number) {
  await requireSession("admin");

  const r = Number(rate);
  if (!Number.isFinite(r) || r < 0.05 || r > 1) {
    throw new Error("Commission must be between 5% and 100%.");
  }

  // commission_rate is a privileged column (revoked from authenticated +
  // escalation trigger), so write it via the service role after the admin check.
  const { error } = await getServiceClient()
    .from("drivers")
    .update({ commission_rate: Math.round(r * 10000) / 10000 })
    .eq("id", driverId);

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

  after(() => notifyDriverAccepted(rideId));
  revalidatePath("/driver");
  return { success: true };
}

export async function declineRideAction(rideId: string) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);

  // Capture the driver's name before the RPC clears the assignment (driver_id → null).
  const admin = getServiceClient();
  const { data: me } = await admin.from("drivers").select("user_id").eq("user_id", session.user.id).single();
  let driverName = "A chauffeur";
  if (me?.user_id) {
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", me.user_id).single();
    if (p?.full_name) driverName = p.full_name;
  }

  const { error } = await supabase.rpc("driver_decline_ride", { _booking_id: rideId });

  if (error) {
    throw new Error(error.message);
  }

  after(() => notifyDriverDeclined(rideId, driverName));
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
    .select("id, total_earnings, commission_rate")
    .eq("user_id", userId)
    .single();

  if (driverErr || !driver) {
    throw new Error("Driver profile not found");
  }

  // Complete only an in-progress ride, and read its payout from the DB in the
  // same statement — the client no longer supplies the fare (was tamperable).
  const { data: updated, error: bookingErr } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", rideId)
    .eq("status", "in_progress")
    .select("id, fare_estimate, driver_payout, tip");

  if (bookingErr) {
    throw new Error(bookingErr.message);
  }
  if (!updated || updated.length === 0) {
    throw new Error("Only a ride in progress can be completed.");
  }

  // Credit the payout snapshot taken at assignment (fare × commission rate at
  // the time); legacy rows without a snapshot fall back to the driver's
  // current rate. The customer's tip goes to the driver in full, on top.
  // total_earnings is a privileged column revoked from authenticated, so
  // credit it via the service role.
  const row = updated[0];
  const payout =
    row.driver_payout != null
      ? Number(row.driver_payout)
      : Math.round(Number(row.fare_estimate ?? 0) * Number(driver.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100) / 100;
  const earned = Math.round((payout + Math.max(0, Number(row.tip ?? 0))) * 100) / 100;
  const newEarnings = Number(driver.total_earnings ?? 0) + earned;

  const { error: driverUpdateErr } = await getServiceClient()
    .from("drivers")
    .update({ total_earnings: newEarnings })
    .eq("id", driver.id);

  if (driverUpdateErr) {
    throw new Error(driverUpdateErr.message);
  }

  after(() => notifyRideCompleted(rideId));
  revalidatePath("/driver");
  return { success: true, earned };
}
