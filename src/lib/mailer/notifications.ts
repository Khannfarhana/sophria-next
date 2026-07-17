import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendMail } from "./send";
import { getAdminEmail } from "./config";
import { formatDateTime } from "@/lib/datetime";

/**
 * Transactional email notifications for the booking lifecycle.
 *
 * Every function is FIRE-AND-FORGET and NON-THROWING: a mail failure must never
 * break the booking action that triggered it. Recipients and details are loaded
 * server-side from the DB (service role) — never trusted from the client.
 */

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const APP_URL = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
const url = (path: string) => (APP_URL ? `${APP_URL}${path}` : "");

const fmtDateTime = (iso: string) => formatDateTime(iso);
const fmtFare = (n: unknown) => `$${Number(n ?? 0).toFixed(2)} CAD`;

interface BookingContext {
  reference: string;
  pickup: string;
  dropoff: string;
  datetime: string;
  fare: string;
  vehicle: string;
  otp: string;
  tripType: string;
  rejectionReason: string;
  /** Set when the admin changed the fare — surfaced in the payment-request email. */
  previousFare: string;
  fareChangeReason: string;
  passengerName: string;
  customer: { name: string; email: string } | null;
  driver: { name: string; email: string; phone: string } | null;
}

/** Load everything the templates need for a booking, in a few service-role reads. */
async function loadBookingContext(bookingId: string): Promise<BookingContext | null> {
  const admin = svc();
  const { data: b } = await admin
    .from("bookings")
    .select("reference, pickup_location, dropoff_location, pickup_datetime, fare_estimate, previous_fare, fare_change_reason, trip_type, customer_id, driver_id, vehicle_id, start_otp, rejection_reason, rejection_notes, passenger_name")
    .eq("id", bookingId)
    .single();
  if (!b) return null;

  const [customerRes, vehicleRes, driverRes] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", b.customer_id).single(),
    b.vehicle_id ? admin.from("vehicles").select("name").eq("id", b.vehicle_id).single() : Promise.resolve({ data: null }),
    b.driver_id ? admin.from("drivers").select("user_id").eq("id", b.driver_id).single() : Promise.resolve({ data: null }),
  ]);

  let driver: BookingContext["driver"] = null;
  if (driverRes.data?.user_id) {
    const { data: dp } = await admin.from("profiles").select("full_name, email, phone").eq("id", driverRes.data.user_id).single();
    if (dp) driver = { name: dp.full_name ?? "Chauffeur", email: dp.email ?? "", phone: dp.phone ?? "" };
  }

  const reason = b.rejection_reason
    ? `${String(b.rejection_reason).replace(/_/g, " ")}${b.rejection_notes ? ` — ${b.rejection_notes}` : ""}`
    : "";

  return {
    reference: b.reference,
    pickup: b.pickup_location,
    dropoff: b.dropoff_location,
    datetime: fmtDateTime(b.pickup_datetime),
    fare: fmtFare(b.fare_estimate),
    vehicle: vehicleRes.data?.name ?? "",
    otp: b.start_otp ?? "",
    tripType: b.trip_type ?? "one_way",
    rejectionReason: reason,
    previousFare: b.previous_fare != null ? fmtFare(b.previous_fare) : "",
    fareChangeReason: b.fare_change_reason ?? "",
    passengerName: b.passenger_name ?? "",
    customer: customerRes.data ? { name: customerRes.data.full_name ?? "Valued Guest", email: customerRes.data.email ?? "" } : null,
    driver,
  };
}

/** Run a set of sends without ever throwing back to the caller. */
async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error("[notifications] send failed:", err);
  }
}

const base = (c: BookingContext) => ({
  reference: c.reference, pickup: c.pickup, dropoff: c.dropoff,
  datetime: c.datetime, fare: c.fare, vehicle: c.vehicle,
});

/* --------------------------- lifecycle events --------------------------- */

/** Booking requested → customer (received + code) + admin (new request). */
export function notifyBookingCreated(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c) return;
    const sends: Promise<unknown>[] = [];
    if (c.customer?.email) {
      sends.push(sendMail({
        to: c.customer.email,
        subject: `Booking received — ${c.reference}`,
        template: { name: "booking-received", data: { ...base(c), customerName: c.customer.name, otp: c.otp, ctaUrl: url("/dashboard") } },
      }));
    }
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      sends.push(sendMail({
        to: adminEmail,
        subject: `New booking request — ${c.reference}`,
        template: { name: "booking-request-admin", data: { ...base(c), customerName: c.customer?.name ?? "", ctaUrl: url("/admin") } },
      }));
    }
    await Promise.all(sends);
  });
}

/** Admin confirmed → customer (payment of the full fare is now required).
 *  Also re-sent when the admin changes the fare of an awaiting-payment
 *  booking — the template then carries the previous fare + change reason. */
export function notifyBookingConfirmed(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c?.customer?.email) return;
    await sendMail({
      to: c.customer.email,
      subject: `Booking confirmed — payment required — ${c.reference}`,
      template: {
        name: "booking-confirmed",
        data: {
          ...base(c),
          customerName: c.customer.name,
          otp: c.otp,
          previousFare: c.previousFare,
          fareChangeReason: c.fareChangeReason,
          ctaUrl: url("/dashboard"),
        },
      },
    });
  });
}

/** Payment received → customer receipt + admin "assign driver" prompt. */
export function notifyPaymentReceived(bookingId: string, p: { amount: string; paymentRef: string; tip?: string }) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c) return;
    const sends: Promise<unknown>[] = [];
    if (c.customer?.email) {
      sends.push(sendMail({
        to: c.customer.email,
        subject: `Payment received — ${c.reference}`,
        template: { name: "payment-received", data: { ...base(c), customerName: c.customer.name, amount: p.amount, tip: p.tip ?? "", paymentRef: p.paymentRef, ctaUrl: url("/dashboard") } },
      }));
    }
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      sends.push(sendMail({
        to: adminEmail,
        subject: `Payment received — assign driver — ${c.reference}`,
        template: { name: "payment-received-admin", data: { ...base(c), customerName: c.customer?.name ?? "", amount: p.amount, tip: p.tip ?? "", ctaUrl: url("/admin") } },
      }));
    }
    await Promise.all(sends);
  });
}

/** Admin rejected → customer (with reason). */
export function notifyBookingRejected(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c?.customer?.email) return;
    await sendMail({
      to: c.customer.email,
      subject: `Update on your booking — ${c.reference}`,
      template: { name: "booking-rejected", data: { reference: c.reference, customerName: c.customer.name, reason: c.rejectionReason, ctaUrl: url("/book") } },
    });
  });
}

/** Driver assigned → customer + driver. */
export function notifyDriverAssigned(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c) return;
    const sends: Promise<unknown>[] = [];
    if (c.customer?.email) {
      sends.push(sendMail({
        to: c.customer.email,
        subject: `Your chauffeur is assigned — ${c.reference}`,
        template: { name: "driver-assigned-customer", data: { ...base(c), customerName: c.customer.name, driverName: c.driver?.name ?? "", driverPhone: c.driver?.phone ?? "", otp: c.otp, ctaUrl: url("/dashboard") } },
      }));
    }
    if (c.driver?.email) {
      sends.push(sendMail({
        to: c.driver.email,
        subject: `New ride assigned — ${c.reference}`,
        template: { name: "driver-assigned-driver", data: { ...base(c), driverName: c.driver.name, passengerName: c.passengerName, ctaUrl: url("/driver") } },
      }));
    }
    await Promise.all(sends);
  });
}

/** Driver accepted → customer. */
export function notifyDriverAccepted(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c?.customer?.email) return;
    await sendMail({
      to: c.customer.email,
      subject: `Your chauffeur confirmed — ${c.reference}`,
      template: { name: "driver-accepted-customer", data: { reference: c.reference, datetime: c.datetime, pickup: c.pickup, customerName: c.customer.name, driverName: c.driver?.name ?? "", driverPhone: c.driver?.phone ?? "", otp: c.otp, ctaUrl: url("/dashboard") } },
    });
  });
}

/** Driver declined → admin (needs reassignment). Pass the driver name before it's cleared. */
export function notifyDriverDeclined(bookingId: string, driverName: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    const adminEmail = getAdminEmail();
    if (!c || !adminEmail) return;
    await sendMail({
      to: adminEmail,
      subject: `Ride declined — ${c.reference}`,
      template: { name: "driver-declined-admin", data: { ...base(c), driverName, customerName: c.customer?.name ?? "", ctaUrl: url("/admin") } },
    });
  });
}

/** Ride completed → customer. */
export function notifyRideCompleted(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c?.customer?.email) return;
    await sendMail({
      to: c.customer.email,
      subject: `Thank you for riding with SophRia — ${c.reference}`,
      template: { name: "ride-completed", data: { ...base(c), customerName: c.customer.name, ctaUrl: url("/book") } },
    });
  });
}

/** Booking cancelled → customer + admin. */
export function notifyBookingCancelled(bookingId: string) {
  return safe(async () => {
    const c = await loadBookingContext(bookingId);
    if (!c) return;
    const sends: Promise<unknown>[] = [];
    if (c.customer?.email) {
      sends.push(sendMail({
        to: c.customer.email,
        subject: `Booking cancelled — ${c.reference}`,
        template: { name: "booking-cancelled", data: { ...base(c), customerName: c.customer.name, ctaUrl: url("/book") } },
      }));
    }
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      sends.push(sendMail({
        to: adminEmail,
        subject: `Booking cancelled — ${c.reference}`,
        template: { name: "booking-cancelled-admin", data: { ...base(c), customerName: c.customer?.name ?? "" } },
      }));
    }
    await Promise.all(sends);
  });
}

/** Chauffeur application → applicant + admin. */
export function notifyDriverApplication(applicantName: string, applicantEmail: string) {
  return safe(async () => {
    const sends: Promise<unknown>[] = [];
    if (applicantEmail) {
      sends.push(sendMail({
        to: applicantEmail,
        subject: "We've received your application — SophRia",
        template: { name: "driver-application-received", data: { applicantName, ctaUrl: url("/") } },
      }));
    }
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      sends.push(sendMail({
        to: adminEmail,
        subject: "New chauffeur application — SophRia",
        template: { name: "driver-application-admin", data: { applicantName, applicantEmail, ctaUrl: url("/admin") } },
      }));
    }
    await Promise.all(sends);
  });
}

/**
 * Admin alert for a booking whose money needs a human.
 *
 * These are the cases where the operational side succeeded and the payment side
 * did not — they used to be a console.error, which is indistinguishable from
 * nothing. A card authorization lives ~7 days and issuers release early, so a
 * hold placed at booking can vanish before the ride: the fare goes uncollected
 * and the only correct resolution is someone chasing an invoice. Marking the
 * booking is not enough on its own; that state is inert until somebody looks.
 *
 * Admin-only and internal, so it sends raw html/text rather than earning a
 * customer-facing template.
 */
function notifyAdminPaymentIssue(bookingId: string, headline: string, guidance: string) {
  return safe(async () => {
    const adminEmail = getAdminEmail();
    if (!adminEmail) return;
    const c = await loadBookingContext(bookingId);
    if (!c) return;
    const rows = [
      `Passenger: ${c.passengerName || c.customer?.name || "—"}`,
      `Pickup:    ${c.pickup}`,
      `Drop-off:  ${c.dropoff}`,
      `When:      ${c.datetime}`,
      `Fare:      $${c.fare}`,
    ];
    await sendMail({
      to: adminEmail,
      subject: `ACTION NEEDED — ${c.reference}: ${headline}`,
      text: [`${c.reference}: ${headline}`, "", ...rows, "", guidance].join("\n"),
      html:
        `<p><strong>${c.reference}: ${headline}</strong></p>` +
        `<p>${rows.join("<br/>")}</p>` +
        `<p>${guidance}</p>`,
    });
  });
}

/** A completed ride whose held funds could not be captured. */
export function notifyPaymentCaptureFailed(bookingId: string) {
  return notifyAdminPaymentIssue(
    bookingId,
    "ride completed but the payment could NOT be captured",
    "The authorization most likely expired before the ride (holds last ~7 days). " +
      "The booking is marked payment_status = failed. Take payment manually.",
  );
}

/** A hold released BEFORE the ride — the booking is no longer funded. */
export function notifyPaymentHoldReleased(bookingId: string) {
  return notifyAdminPaymentIssue(
    bookingId,
    "the card hold was released before the ride",
    "Stripe reports the authorization is cancelled, so no funds are held. The booking is " +
      "back to payment_status = pending and CANNOT be dispatched until it is paid again. " +
      "A driver may already be assigned — re-request payment or contact the passenger.",
  );
}
