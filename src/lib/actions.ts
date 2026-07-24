"use server";

import { auth } from "@/auth";
import type { Database } from "@/integrations/supabase/types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Session } from "next-auth";
import {
  priceBreakdown,
  round2,
  HST_RATE,
  DEFAULT_DRIVER_PAYOUT_RATE,
  driverPayoutBase,
  type FareBreakdown,
  type TripType,
} from "@/lib/pricing";
import { resolvePearsonTariff } from "@/lib/tariff";
import { getDirections } from "@/lib/mapbox";
import { toStorageIso, isFuturePickup } from "@/lib/datetime";
import { loadPricingConfig, loadTariffDestinations } from "@/lib/pricing-config.server";
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
  notifyDriverApproved,
  notifyDriverApplicationDeclined,
  notifyDriverAccessRevoked,
  notifyDriverApplicationNudge,
  notifyPaymentCaptureFailed,
} from "@/lib/mailer/notifications";
import {
  expireOpenCheckoutSessions,
  refundBookingPayment,
  captureBookingPayment,
  releaseBookingHold,
} from "@/lib/payments";
import { refundQuote } from "@/lib/cancellation";
import {
  driverApplicationSchema,
  missingDocKeys,
  CHAUFFEUR_TERMS_VERSION,
  STAGE_LABELS,
  type ApplicationStage,
} from "@/lib/driver-application";
import { DOC_LABELS, isKnownDocType } from "@/lib/driver-docs";
import { parseStops, routableStops, type BookingStop } from "@/lib/stops";

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
    luggageCount?: number | null;
    /** Intermediate stops, routed through in order — they change the distance. */
    stops?: BookingStop[];
  },
): Promise<{ breakdown: FareBreakdown; distanceKm: number | null; durationMin: number | null }> {
  // The authoritative fare — this is what the customer is charged, so both the
  // vehicle rates AND the rate card are read server-side from the database.
  // Never from the client, and never from a constant the client also holds.
  const [{ data: vehicle }, config, tariffDestinations] = await Promise.all([
    admin.from("vehicles").select("base_rate, hourly_rate, type, tariff_multiplier, luggage, per_km_rate, min_fare").eq("id", opts.vehicleId).single(),
    loadPricingConfig(),
    loadTariffDestinations(),
  ]);
  if (!vehicle) throw new Error("Vehicle not found");

  let distanceKm: number | null = opts.fallbackDistanceKm ?? null;
  let durationMin: number | null = null;
  if (opts.tripType !== "hourly" && opts.pickup && opts.dropoff) {
    const dir = await getDirections(opts.pickup, opts.dropoff, routableStops(opts.stops ?? []));
    if (dir) { distanceKm = dir.distanceKm; durationMin = dir.durationMin; }
  }

  // Pearson airport trips are priced by the official GTAA tariff — resolved
  // against the LIVE rate card and destination table, falling back to the
  // built-in February 2024 card when either is unavailable.
  const tariff =
    opts.tripType === "airport"
      ? resolvePearsonTariff(
          {
            pickup: opts.pickupText,
            dropoff: opts.dropoffText,
            pickupCoords: opts.pickup ?? undefined,
            dropoffCoords: opts.dropoff ?? undefined,
            distanceKm,
          },
          { cfg: config, destinations: tariffDestinations },
        )
      : null;

  const breakdown = priceBreakdown(
    opts.tripType,
    vehicle,
    {
      durationHours: opts.durationHours ?? undefined,
      distanceKm: distanceKm ?? undefined,
      tariff,
      passengerCount: opts.passengerCount,
      luggageCount: opts.luggageCount,
    },
    config,
  );
  return { breakdown, distanceKm, durationMin };
}

/**
 * Fare columns for a booking insert/update, from a computed breakdown.
 *
 * base_fare carries the tariff surcharge. There is no surcharge column, and
 * every reader (BookingDetailDialog, the admin) derives the base as
 * `fare_estimate - markup - airport_fee` — so leaving the surcharge out of all
 * four would make those three stop summing to fare_estimate and quietly go
 * missing from the receipt. Folding it into base_fare keeps the invariant
 * base_fare + markup_amount + airport_fee = fare_estimate true, and matches
 * what the customer is shown anyway: one base fare, never a "$15" line.
 */
function fareColumns(b: FareBreakdown) {
  return {
    fare_estimate: b.subtotal,
    base_fare: round2(b.baseFare + b.surcharge),
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
  stops?: unknown;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient(session);
  const userId = session.user.id;

  // The picker's `min` is a hint, not a control — this is a public endpoint.
  // Nothing else rejects a past pickup: toStorageIso only guards NaN, and
  // silently coerces garbage to `new Date()`, so an empty datetime used to
  // book a ride for the instant it was submitted.
  // Expected failures are RETURNED, not thrown — Next.js redacts thrown
  // Server Action messages in production, and the user needs to read these.
  if (!isFuturePickup(data.datetime)) {
    return { error: "Pick-up time must be in the future — go back to Date & time and pick a new slot." } as const;
  }

  const tripType = data.tripType ?? "one_way";
  // Never trust the client's stop list — cap, clamp and strip it. The DB check
  // constraint enforces the 5-stop limit as well.
  const stops = parseStops(data.stops);
  // Generated here and returned directly — clients can no longer SELECT the
  // start_otp column, so it must not appear in the returning clause.
  const startOtp = generateOtp();

  // Never trust the client-supplied fare/distance — recompute from DB rates.
  let pricing: Awaited<ReturnType<typeof computeServerFare>>;
  try {
    pricing = await computeServerFare(getServiceClient(), {
    vehicleId: data.vehicleId,
    tripType,
    durationHours: data.durationHours,
    pickup: data.pickupLng != null && data.pickupLat != null ? { lng: data.pickupLng, lat: data.pickupLat } : null,
    dropoff: data.dropoffLng != null && data.dropoffLat != null ? { lng: data.dropoffLng, lat: data.dropoffLat } : null,
    fallbackDistanceKm: data.distanceKm,
    pickupText: data.pickup,
    dropoffText: data.dropoff,
    passengerCount: data.passengerCount,
    luggageCount: data.luggageCount,
    stops,
    });
  } catch (err) {
    console.error("[createBookingAction] pricing failed", err);
    return { error: err instanceof Error && err.message === "Vehicle not found"
      ? "That vehicle class is no longer available — please pick another."
      : "We couldn't price this trip. Please check the addresses and try again." } as const;
  }

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
      // Hourly trips are "as directed" — stops are the chauffeur's to follow on
      // the day, not a fixed itinerary priced up front.
      stops: tripType === "hourly" ? [] : stops,
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
    console.error("[createBookingAction] insert failed", error);
    return { error: "We couldn't create the booking. Please try again in a moment." } as const;
  }

  after(() => notifyBookingCreated(booking.id));
  revalidatePath("/dashboard");
  return { reference: booking.reference, start_otp: startOtp } as const;
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
    .select("customer_id, vehicle_id, trip_type, duration_hours, status, payment_status, passenger_count, stops")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new Error("This booking can no longer be edited.");
  }
  // Paying does not advance `status` — only `payment_status` — so a paid or
  // held booking sits at 'confirmed' and would otherwise still be editable
  // here. Re-routing recomputes the fare under the service role (bypassing the
  // tamper trigger) without re-charging the card, so a customer could pay for a
  // 5 km trip and then rewrite it to a 450 km one for the same money — and
  // driver_payout would snapshot off the inflated fare. Match the admin fare
  // path (updateBookingFareAction), which pins payment_status = 'pending'.
  if (booking.payment_status !== "pending") {
    throw new Error("This booking can no longer be edited — it has already been paid.");
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
    // Keep routing through the booking's existing stops — recomputing without
    // them would quietly drop the distance they add and undercharge the ride.
    stops: parseStops(booking.stops),
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

/** Statuses a customer may still cancel from — never one already under way. */
const CANCELLABLE = ["pending", "confirmed", "driver_assigned", "accepted"] as const;

/**
 * Cancel a booking, applying the penalty ladder and refunding the balance.
 *
 * Previously this only flipped `status` and left the money captured, against a
 * published refund policy. Order matters here: the cancellation is CLAIMED with
 * a conditional update first, so exactly one caller can proceed to the refund;
 * issuing the Stripe refund before the claim would let two concurrent cancels
 * both pay out.
 *
 * Uses the service client because the penalty/refund columns are guarded by
 * prevent_booking_payout_tamper; ownership is checked in code.
 */
export async function cancelBookingAction(bookingId: string) {
  const session = await requireSession();
  const admin = getServiceClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, customer_id, status, payment_status, pickup_datetime, fare_estimate, tax_amount, tip, stripe_payment_id, payment_mode, deposit_amount, balance_due, balance_paid_at, balance_method",
    )
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== session.user.id) throw new Error("Unauthorized");

  const now = Date.now();
  const quote = refundQuote(booking, now);
  const wasPaid = booking.payment_status === "paid";
  const wasHeld = booking.payment_status === "authorized";
  const hadFunds = wasPaid || wasHeld;

  // Deposit bookings: the penalty ladder still prices off the taxed fare, but
  // what we actually HOLD is only the deposit (plus the balance, if it was
  // paid online pre-ride). The recorded penalty is capped at what was
  // collected — a fee larger than the money in hand is a fiction.
  const isDeposit = booking.payment_mode === "deposit";
  const depositHeld = isDeposit ? Math.max(0, Number(booking.deposit_amount ?? 0)) : 0;
  const balanceHeldOnline =
    isDeposit && booking.balance_paid_at && booking.balance_method === "online"
      ? Math.max(0, Number(booking.balance_due ?? 0)) + Math.max(0, Number(booking.tip ?? 0))
      : 0;
  const depositCollected = round2(depositHeld + balanceHeldOnline);
  const effectivePenalty = isDeposit ? Math.min(quote.penalty, depositCollected) : quote.penalty;

  const { data: claimed, error } = await admin
    .from("bookings")
    .update({
      status: "cancelled" as const,
      cancelled_at: new Date(now).toISOString(),
      cancellation_penalty_rate: quote.rate,
      cancellation_penalty: hadFunds ? effectivePenalty : 0,
      refund_amount: 0,
    })
    .eq("id", bookingId)
    .in("status", CANCELLABLE)
    .select("id");

  if (error) throw new Error(error.message);
  if (!claimed || claimed.length === 0) {
    throw new Error("This ride can no longer be cancelled.");
  }

  // Three cases:
  //
  //   held  — nothing was ever charged, so there is nothing to refund. Capture
  //           just the fee (Stripe releases the untaken balance automatically),
  //           or cancel the intent outright when the cancellation is free. The
  //           customer never waits 5-10 days for their own money back.
  //   paid  — money is already taken (booking was beyond the hold window), so
  //           refund the balance.
  //   neither — the penalty is recorded but uncollected; we never held funds.
  // The claim above ALREADY committed — status is 'cancelled' and the penalty
  // is recorded. Everything below moves money and throws on failure
  // (captureBookingPayment/refundBookingPayment document this: "the caller must
  // know the money did not move"). Unguarded, a throw here escaped past the
  // notify and returned a raw Stripe error to the customer, who reasonably read
  // it as "the cancellation failed" — while the booking WAS cancelled, the DB
  // claimed a fee that was never taken, and no email was ever sent.
  //
  // So: never let a payment failure rewrite what happened to the booking, and
  // never let the DB assert money moved when it didn't.
  let refunded = 0;
  let settlementFailed = false;
  try {
    if (wasHeld) {
      if (quote.penalty > 0) {
        // Partial capture: the fee comes out of the hold and Stripe releases
        // the balance immediately — no refund, no 5-10 day wait.
        await captureBookingPayment({
          bookingId,
          paymentIntentId: booking.stripe_payment_id,
          amountCents: Math.round(quote.penalty * 100),
        });
      } else {
        await releaseBookingHold(bookingId, booking.stripe_payment_id);
      }
    } else if (wasPaid && isDeposit) {
      // Refund what was collected minus the penalty. stripe_payment_id is the
      // DEPOSIT intent, so a refund through it is capped at the deposit; the
      // rare remainder (balance paid online, then a nearly-free cancellation)
      // lives on a different intent and goes to an admin to refund by hand.
      const refundTotal = Math.max(0, round2(depositCollected - effectivePenalty));
      const refundNow = Math.min(refundTotal, depositHeld);
      if (refundNow > 0) {
        await refundBookingPayment({
          bookingId,
          paymentIntentId: booking.stripe_payment_id,
          amountCents: Math.round(refundNow * 100),
          penalty: effectivePenalty,
        });
        refunded = refundNow;
      }
      if (refundTotal > refundNow) {
        console.error(
          `[actions] booking ${bookingId}: $${(refundTotal - refundNow).toFixed(2)} of the online balance payment must be refunded manually (separate intent).`,
        );
        after(() => notifyPaymentCaptureFailed(bookingId));
      }
    } else if (wasPaid && quote.refund > 0) {
      await refundBookingPayment({
        bookingId,
        paymentIntentId: booking.stripe_payment_id,
        amountCents: Math.round(quote.refund * 100),
        penalty: quote.penalty,
      });
      refunded = quote.refund;
    }
  } catch (err) {
    settlementFailed = true;
    console.error(`[actions] cancellation settlement failed for booking ${bookingId}:`, err);
    // Correct the record rather than leave it lying. The most likely cause is a
    // lapsed hold, so the fee was NOT collected — carrying cancellation_penalty
    // would show the customer a charge that never happened and feed a false
    // figure into admin reporting.
    const { error: fixErr } = await admin
      .from("bookings")
      .update({ cancellation_penalty: 0, refund_amount: 0 })
      .eq("id", bookingId);
    if (fixErr) console.error(`[actions] could not zero the uncollected penalty on ${bookingId}:`, fixErr.message);
    after(() => notifyPaymentCaptureFailed(bookingId));
  }

  // Fires either way: the ride IS cancelled, and the customer must be told —
  // that is not contingent on the money having settled.
  after(() => notifyBookingCancelled(bookingId));
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return {
    success: true,
    penalty: hadFunds && !settlementFailed ? effectivePenalty : 0,
    refund: refunded,
    /** True when the balance was released from a hold rather than refunded. */
    released: wasHeld && !settlementFailed,
    rate: quote.rate,
    /**
     * The cancellation stuck but the payment side did not. The UI must not
     * claim a fee was taken or a refund issued; an admin has been emailed.
     */
    settlementFailed,
  };
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

  // The mail depends on the DIRECTION of the flip: pending→approved is a
  // welcome, verified→revoked is an access notice. Same flag, different letter.
  const { data: before } = await admin
    .from("drivers")
    .select("is_verified")
    .eq("id", driverId)
    .maybeSingle();

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

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", driver.user_id)
      .maybeSingle();
    const name = profile?.full_name || "there";
    const email = profile?.email || "";
    if (verified && !before?.is_verified) {
      after(() => notifyDriverApproved(name, email));
    } else if (!verified && before?.is_verified) {
      after(() => notifyDriverAccessRevoked(name, email));
    }
  }

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Decline a PENDING application. Before this existed an application could only
 * be approved or ignored forever. Declining removes the application (drivers
 * row + document rows) so the applicant sees the form again and can re-apply
 * if their circumstances change, and emails them the decision. Uploaded files
 * stay in storage — re-applying replaces them, same as before.
 */
export async function declineDriverApplicationAction(driverId: string) {
  await requireSession("admin");
  const admin = getServiceClient();

  const { data: driver } = await admin
    .from("drivers")
    .select("id, user_id, is_verified")
    .eq("id", driverId)
    .maybeSingle();
  if (!driver) throw new Error("Application not found.");
  // A verified driver is not an application any more — that path is "revoke",
  // which keeps the record. Declining must never delete an active driver.
  if (driver.is_verified) throw new Error("This driver is already approved — revoke access instead.");

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", driver.user_id)
    .maybeSingle();

  await admin.from("driver_documents").delete().eq("driver_id", driver.id);
  const { error } = await admin.from("drivers").delete().eq("id", driver.id);
  if (error) throw new Error(error.message);

  after(() => notifyDriverApplicationDeclined(profile?.full_name || "there", profile?.email || ""));
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Email a stalled applicant a reminder to finish their in-progress
 * application. Rate-limited to one nudge per 24h per applicant (nudged_at,
 * service-role written) so two admin tabs can't double-send.
 */
export async function nudgeDriverApplicantAction(applicantUserId: string) {
  await requireSession("admin");
  const admin = getServiceClient();

  const { data: draft } = await admin
    .from("driver_application_drafts")
    .select("user_id, application_type, stage, form, nudged_at")
    .eq("user_id", applicantUserId)
    .maybeSingle();
  if (!draft) throw new Error("No in-progress application for this person.");

  if (draft.nudged_at && Date.now() - new Date(draft.nudged_at).getTime() < 24 * 60 * 60 * 1000) {
    throw new Error("Already nudged in the last 24 hours.");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", applicantUserId)
    .maybeSingle();
  const form = (draft.form ?? {}) as Record<string, string>;
  const email = profile?.email || form.email || "";
  if (!email) throw new Error("This applicant has no email on file.");
  const name = profile?.full_name || form.fullName || "there";

  // Stamp BEFORE sending: a stamp without a mail costs one wasted day of
  // cooldown; a mail without a stamp allows spam. The former is the safe miss.
  const { error } = await admin
    .from("driver_application_drafts")
    .update({ nudged_at: new Date().toISOString() })
    .eq("user_id", applicantUserId);
  if (error) throw new Error(error.message);

  const stageLabel = STAGE_LABELS[draft.stage as ApplicationStage] ?? "";
  after(() => notifyDriverApplicationNudge(name, email, stageLabel, draft.application_type === "owner_operator"));
  revalidatePath("/admin");
  return { success: true, nudgedAt: new Date().toISOString() };
}

/**
 * Public chauffeur application. Requires sign-in (to link the account), but the
 * applicant is NOT granted the driver role — this creates a PENDING record only.
 * Runs via the service role so it works before the user is a driver, and so the
 * applicant can't set privileged fields (is_verified stays false).
 *
 * Everything is re-validated here. A server action is a public HTTP endpoint:
 * this previously trusted its typed argument completely and wrote it straight
 * to the DB, so any signed-in caller could bypass every rule the form enforced.
 */
export async function submitDriverApplicationAction(data: {
  application: unknown;
  photoPath: string | null;
  docs: { docType: string; path: string }[];
}) {
  const session = await requireSession();
  const admin = getServiceClient();
  const userId = session.user.id;

  const parsed = driverApplicationSchema.safeParse(data.application);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Your application is incomplete.");
  }
  const app = parsed.data;

  if (!data.photoPath) throw new Error("A driver photo is required.");

  // Storage paths come from the CLIENT (become-chauffeur uploads directly, then
  // posts the resulting paths), so they are attacker-chosen strings. They were
  // only checked for truthiness. The storage RLS policy scopes writes to
  // `${auth.uid()}/...`, but this action reads paths rather than writing files,
  // and the admin review dialog later signs whatever path is stored — using
  // ADMIN credentials, which are not so scoped.
  //
  // So an attacker who learned another applicant's object path (a previously
  // shared signed URL embeds the full path) could submit it as their own and
  // have the reviewer shown the victim's genuine licence and insurance under
  // the attacker's name — and be approved, and granted the driver role, on
  // someone else's credentials. Pin every path to the caller's own prefix.
  const ownsPath = (p: string) => p.startsWith(`${userId}/`) && !p.includes("..");
  if (!ownsPath(data.photoPath)) throw new Error("Invalid photo upload.");
  for (const d of data.docs) {
    if (d.path && !ownsPath(d.path)) throw new Error("Invalid document upload.");
  }

  // "Nothing is optional, this part is all mandatory" — enforce it server-side
  // too, not just in the form. Which documents are mandatory depends on the
  // application type: fleet drivers have no vehicle to document.
  const provided = data.docs.filter((d) => d.path).map((d) => d.docType);
  const missing = missingDocKeys(provided, app.applicationType);
  if (missing.length > 0) {
    const names = missing.map((k) => DOC_LABELS[k] ?? k);
    throw new Error(`Missing required document${missing.length > 1 ? "s" : ""}: ${names.join(", ")}.`);
  }

  // docType is only checked for the PRESENCE of the required keys, so arbitrary
  // extra keys used to ride straight into the insert. Drop anything unknown.
  const cleanDocs = data.docs.filter((d) => d.path && isKnownDocType(d.docType));

  // Never overwrite an application that has already been reviewed: the upsert
  // below is keyed on user_id, so without this an approved driver could re-post
  // and reset their own record.
  const { data: existing } = await admin
    .from("drivers")
    .select("id, is_verified")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.is_verified) {
    throw new Error("You're already an approved chauffeur.");
  }

  // Fleet drivers apply without a vehicle — the vehicle columns stay null and
  // the admin dialog reads application_type to know that's by design, not a gap.
  const isOwner = app.applicationType === "owner_operator";
  const { data: driver, error } = await admin
    .from("drivers")
    .upsert({
      user_id: userId,
      application_type: app.applicationType,
      license_number: app.license,
      licence_class: app.licenceClass,
      experience_years: app.experience,
      city_of_residence: app.city,
      province: app.province,
      work_authorization: app.workAuthorization,
      languages_spoken: app.languages,
      time_availability: app.availability,
      referral_name: app.referral || null,
      photo_url: data.photoPath,
      vehicle_class: isOwner ? app.vehicleClass : null,
      vehicle_make: isOwner ? app.vehicleMake : null,
      vehicle_model: isOwner ? app.vehicleModel : null,
      vehicle_year: isOwner ? app.vehicleYear : null,
      limo_plate: isOwner ? app.limoPlate : null,
      // Stamped server-side from the server's clock — a client-supplied
      // acceptance timestamp would be worth nothing as a legal record.
      terms_accepted_at: new Date().toISOString(),
      terms_version: CHAUFFEUR_TERMS_VERSION,
      is_verified: false,
      is_available: false,
    }, { onConflict: "user_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin.from("profiles").update({ full_name: app.fullName, phone: app.phone }).eq("id", userId);

  // The application is in — clear the autosaved draft so the funnel view stops
  // counting this person as "in progress".
  await admin.from("driver_application_drafts").delete().eq("user_id", userId);

  // Re-applying replaces the previous document set rather than stacking a
  // second copy of every file under the same driver.
  await admin.from("driver_documents").delete().eq("driver_id", driver.id);
  const rows = cleanDocs.map((d) => ({ driver_id: driver.id, doc_type: d.docType, file_url: d.path }));
  if (rows.length > 0) {
    const { error: docErr } = await admin.from("driver_documents").insert(rows);
    if (docErr) throw new Error(docErr.message);
  }

  after(() => notifyDriverApplication(
    app.fullName || "there",
    session.user.email ?? "",
    isOwner ? "Brings own vehicle" : "Drives a SophRia vehicle",
  ));
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
    .update({ status: "confirmed" as BookingStatus })
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

  // Guarded like confirm — but on MONEY, not just status. Rejection is the
  // "we never took this job" exit and has no refund path, so it must only be
  // reachable while nothing has been charged or held. Unguarded, rejecting a
  // paid/deposited/assigned booking stranded the customer's money in a state
  // no code path ever refunds. Once funds are secured the off-ramp is the
  // cancellation flow, which settles the money properly.
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "rejected" as BookingStatus,
      rejection_reason: reason,
      rejection_notes: notes || null,
    })
    .eq("id", bookingId)
    .in("status", ["pending", "confirmed"])
    .eq("payment_status", "pending")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error(
      "Only an unpaid booking can be rejected. This one has funds secured — cancel it instead so the customer is refunded.",
    );
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
      .select("fare_estimate, airport_fee, payment_mode, balance_due")
      .eq("id", bookingId)
      .single();
    if (bkErr || !bk) throw new Error("Booking not found");

    if (bk.payment_mode === "deposit" && bk.balance_due != null) {
      // Deposit bookings: the payout defaults to the balance the customer was
      // QUOTED at deposit time. On a cash ride the driver keeps exactly what
      // they collect — a payout computed from this driver's own rate could
      // differ from that frozen figure and leave someone owing someone.
      payout = round2(Number(bk.balance_due));
    } else {
      // The airport fee is excluded: it is the GTAA's money, not SophRia's
      // revenue, so no share of it is the driver's. See driverPayoutBase.
      payout = round2(
        driverPayoutBase(bk.fare_estimate, bk.airport_fee) * Number(drv.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE),
      );
    }
  }

  // Payment wall: a driver can be assigned (or reassigned, pre-ride) only once
  // the customer's funds are secured. 'authorized' counts — the money is held
  // on the card and is captured when the ride completes. Requiring 'paid' here
  // would make every held booking undispatchable.
  const { data, error } = await supabase
    .from("bookings")
    .update({ driver_id: driverId, status: "driver_assigned" as BookingStatus, driver_payout: payout })
    .eq("id", bookingId)
    .in("status", ["confirmed", "driver_assigned", "accepted"])
    .in("payment_status", ["authorized", "paid"])
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("A driver can only be assigned once the customer's payment is secured.");
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

  // Resolve the caller's own driver row so the update can be pinned to it.
  // requireSession("driver") proves the caller IS a driver, not that they are
  // THIS ride's driver — without the driver_id predicate the only thing
  // stopping A from accepting B's ride was the bookings UPDATE policy.
  const { data: driver, error: driverErr } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", session.user.id)
    .single();
  if (driverErr || !driver) throw new Error("Driver profile not found");

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "accepted" })
    .eq("id", rideId)
    .eq("driver_id", driver.id)
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
  // The guarded update is also what makes the capture below safe to run once:
  // only one caller can move the ride out of in_progress.
  //
  // driver_id is pinned to THIS driver. Without it the only thing separating
  // driver A from completing driver B's ride was the bookings UPDATE policy —
  // and the payout is credited to whoever CALLS this (driver.id is resolved
  // from the caller's user_id) while the amount is read from the victim's
  // booking, so a missing policy meant one driver could bank another's
  // earnings and trigger their capture. Defence in depth: start_ride_with_otp
  // already re-checks the assignee server-side; accept/complete now match.
  const { data: updated, error: bookingErr } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", rideId)
    .eq("driver_id", driver.id)
    .eq("status", "in_progress")
    .select("id, fare_estimate, airport_fee, driver_payout, tip, payment_status, stripe_payment_id, payment_mode, balance_due, balance_paid_at");

  if (bookingErr) {
    throw new Error(bookingErr.message);
  }
  if (!updated || updated.length === 0) {
    throw new Error("Only a ride in progress can be completed.");
  }

  // "After completing the ride we must charge" — take the funds held at booking.
  //
  // Deliberately after the status flip and non-fatal: the ride DID happen, and
  // the driver must still be credited. A capture failure here (an authorization
  // that lapsed before the ride) is an accounts problem to chase, not a reason
  // to tell the chauffeur their completed ride didn't complete.
  // A failure here is NOT swallowed into a log line any more. The hold can
  // lapse before the ride (a card authorization lives ~7 days, and issuers
  // release early), and the booking then sat at 'authorized' forever: the ride
  // dispatched, completed, credited the driver, and the only trace was a
  // console line nobody reads — a free ride, silently.
  //
  // Move it to 'failed', which is the honest state (the money was NOT
  // collected) and the one surface an admin can actually see and chase. The
  // capture stays non-fatal to the DRIVER: the ride happened and they must be
  // credited; an uncollected fare is an accounts problem, not a reason to tell
  // a chauffeur their completed ride didn't complete.
  if (updated[0].payment_status === "authorized") {
    try {
      await captureBookingPayment({
        bookingId: rideId,
        paymentIntentId: updated[0].stripe_payment_id,
      });
    } catch (err) {
      console.error(`[actions] capture failed for completed ride ${rideId}:`, err);
      const { error: flagErr } = await getServiceClient()
        .from("bookings")
        .update({ payment_status: "failed" as const })
        .eq("id", rideId)
        .eq("payment_status", "authorized");
      if (flagErr) console.error(`[actions] could not flag ${rideId} as failed:`, flagErr.message);
      after(() => notifyPaymentCaptureFailed(rideId));
    }
  }

  // Deposit booking whose balance was never paid online: the chauffeur
  // collects it in cash at the ride — completing IS the collection. The
  // balance_paid_at-null gate keeps a last-minute online payment from being
  // double-recorded; whichever settles first wins.
  if (updated[0].payment_mode === "deposit" && !updated[0].balance_paid_at) {
    const { error: cashErr } = await getServiceClient()
      .from("bookings")
      .update({ balance_paid_at: new Date().toISOString(), balance_method: "cash" })
      .eq("id", rideId)
      .is("balance_paid_at", null);
    if (cashErr) console.error(`[actions] could not record cash balance on ${rideId}:`, cashErr.message);
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
      : round2(
          driverPayoutBase(row.fare_estimate, row.airport_fee) *
            Number(driver.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE),
        );
  const earned = round2(payout + Math.max(0, Number(row.tip ?? 0)));

  // Atomic increment, not read-modify-write. Two rides completing at once both
  // read the same total_earnings and the second write erased the first — a
  // driver silently short by a whole ride, with nothing to reconcile against
  // (total_earnings is a standalone counter, not derived from bookings).
  // credit_driver_earnings does `total_earnings = total_earnings + _amount` in
  // one statement, so concurrent credits serialise. Service-role only.
  const { error: driverUpdateErr } = await getServiceClient().rpc("credit_driver_earnings", {
    _driver_id: driver.id,
    _amount: earned,
  });

  if (driverUpdateErr) {
    throw new Error(driverUpdateErr.message);
  }

  after(() => notifyRideCompleted(rideId));
  revalidatePath("/driver");
  return { success: true, earned };
}

/* ------------------------------------------------------------------ *
 *  Fleet management (admin)
 * ------------------------------------------------------------------ */

export interface VehiclePatch {
  name?: string;
  base_rate?: number;
  hourly_rate?: number | null;
  /** One-way $/km for this vehicle. Null = use the global retail rate. */
  per_km_rate?: number | null;
  /** Floor for retail quotes. Null = no minimum. */
  min_fare?: number | null;
  /** Pearson tariff scale for this class (sedan 1.0, SUV 1.3 …). */
  tariff_multiplier?: number;
  capacity?: number;
  luggage?: number;
  description?: string | null;
  is_active?: boolean;
  /**
   * Convention (shared with the public fleet page): features[0] is the model
   * line — the vehicles in this class ("Cadillac LYRIQ · Lexus ES") — and the
   * rest are amenities.
   */
  features?: string[];
}

function validateVehicleNumbers(patch: VehiclePatch) {
  if (patch.base_rate !== undefined && (!Number.isFinite(patch.base_rate) || patch.base_rate <= 0)) {
    throw new Error("Base rate must be a positive amount.");
  }
  if (patch.hourly_rate !== undefined && patch.hourly_rate !== null && (!Number.isFinite(patch.hourly_rate) || patch.hourly_rate <= 0)) {
    throw new Error("Hourly rate must be a positive amount (or empty).");
  }
  // Ranges mirror the DB check constraints (20260723190000 / 20260717150000).
  if (patch.per_km_rate !== undefined && patch.per_km_rate !== null && (!Number.isFinite(patch.per_km_rate) || patch.per_km_rate <= 0 || patch.per_km_rate > 50)) {
    throw new Error("Per-km rate must be between $0 and $50 (or empty to use the global rate).");
  }
  if (patch.min_fare !== undefined && patch.min_fare !== null && (!Number.isFinite(patch.min_fare) || patch.min_fare < 0 || patch.min_fare > 10000)) {
    throw new Error("Minimum fare must be between $0 and $10,000 (or empty for none).");
  }
  if (patch.tariff_multiplier !== undefined && (!Number.isFinite(patch.tariff_multiplier) || patch.tariff_multiplier <= 0 || patch.tariff_multiplier > 10)) {
    throw new Error("Tariff multiplier must be between 0 and 10.");
  }
  if (patch.capacity !== undefined && (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > 60)) {
    throw new Error("Capacity must be between 1 and 60.");
  }
  if (patch.luggage !== undefined && (!Number.isInteger(patch.luggage) || patch.luggage < 0 || patch.luggage > 60)) {
    throw new Error("Luggage must be between 0 and 60.");
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Name is required.");
  }
  if (patch.features !== undefined) {
    if (!Array.isArray(patch.features) || patch.features.length > 25) {
      throw new Error("Too many feature entries.");
    }
    if (patch.features.some((f) => typeof f !== "string" || !f.trim() || f.length > 120)) {
      throw new Error("Each vehicle or amenity must be 1–120 characters.");
    }
  }
}

/** Admin: edit a vehicle class (name, rates, capacity, status). */
export async function updateVehicleAction(vehicleId: string, patch: VehiclePatch) {
  await requireSession("admin");
  validateVehicleNumbers(patch);
  // Whitelist — never spread a client object into an update. `type` is
  // deliberately absent: it is fixed after creation.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["name", "base_rate", "hourly_rate", "per_km_rate", "min_fare", "tariff_multiplier", "capacity", "luggage", "description", "is_active", "features"] as const) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }
  const { error } = await getServiceClient()
    .from("vehicles")
    .update(update)
    .eq("id", vehicleId);
  if (error) throw new Error(error.message);
  // The public fleet page is prerendered — refresh it so edits go live.
  revalidatePath("/fleet");
  return { success: true };
}

/** Admin: add a new vehicle class to the fleet. */
export async function createVehicleAction(input: {
  name: string;
  type: Database["public"]["Enums"]["vehicle_type"];
  base_rate: number;
  hourly_rate: number | null;
  per_km_rate?: number | null;
  min_fare?: number | null;
  tariff_multiplier?: number;
  capacity: number;
  luggage: number;
  description: string | null;
  features?: string[];
}) {
  await requireSession("admin");
  validateVehicleNumbers(input);
  const admin = getServiceClient();
  // New classes go to the end of the display order.
  const { data: last } = await admin
    .from("vehicles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from("vehicles").insert({
    ...input,
    name: input.name.trim(),
    sort_order: (last?.sort_order ?? 0) + 1,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/fleet");
  return { success: true };
}
