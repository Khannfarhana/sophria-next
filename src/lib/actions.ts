"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";

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
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient(session);
  const userId = session.user.id;

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: userId,
      vehicle_id: data.vehicleId,
      pickup_location: data.pickup,
      dropoff_location: data.dropoff,
      pickup_datetime: new Date(data.datetime).toISOString(),
      fare_estimate: data.fare,
      passenger_name: data.passengerName,
      passenger_phone: data.passengerPhone,
      special_requests: data.notes,
      status: "pending",
      payment_status: "pending",
    })
    .select("reference")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  return booking;
}

export async function cancelBookingAction(bookingId: string) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) {
    throw new Error(error.message);
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

export async function respondToRideAction(rideId: string, action: "accept" | "reject") {
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

  const payload = action === "accept"
    ? { driver_id: driver.id, status: "confirmed" as const }
    : { driver_id: null, status: "cancelled" as const };

  const { error } = await supabase
    .from("bookings")
    .update(payload)
    .eq("id", rideId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/driver");
  return { success: true };
}

export async function verifyDriverAction(driverId: string, verified: boolean) {
  const session = await requireSession("admin");
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase
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

  const { error } = await supabase
    .from("bookings")
    .update({ status: "confirmed" as any })
    .eq("id", rideId);

  if (error) {
    throw new Error(error.message);
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

export async function startRideAction(rideId: string) {
  const session = await requireSession("driver");
  const supabase = getSupabaseServerClient(session);

  const { error } = await supabase
    .from("bookings")
    .update({ status: "in_progress" as any })
    .eq("id", rideId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/driver");
  return { success: true };
}

export async function completeRideAction(rideId: string, fareEstimate: number) {
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

  // Update booking status
  const { error: bookingErr } = await supabase
    .from("bookings")
    .update({ status: "completed" as any, payment_status: "completed" as any })
    .eq("id", rideId);

  if (bookingErr) {
    throw new Error(bookingErr.message);
  }

  // Increment driver's total earnings (80% of the fare)
  const earningsIncrease = fareEstimate * 0.8;
  const newEarnings = Number(driver.total_earnings ?? 0) + earningsIncrease;

  const { error: driverUpdateErr } = await supabase
    .from("drivers")
    .update({ total_earnings: newEarnings })
    .eq("id", driver.id);

  if (driverUpdateErr) {
    throw new Error(driverUpdateErr.message);
  }

  revalidatePath("/driver");
  return { success: true };
}
