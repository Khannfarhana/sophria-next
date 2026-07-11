export interface TemplateResult {
  html: string;
  text: string;
}

export type MailTemplateFn = (data: Record<string, string>) => TemplateResult;

/** Escape user-controlled values before interpolating into email HTML. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------------------------------------------------------------------- *
 *  Shared, theme-based building blocks (SophRia: dark #0d0d0e / gold #e7d3a8)
 * ---------------------------------------------------------------------- */

function emailWrapper(title: string, bodyContentHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background-color:#faf9f6; color:#1a1a1a; -webkit-font-smoothing:antialiased; }
    .wrapper { width:100%; background-color:#faf9f6; padding:40px 0; }
    .container { max-width:600px; margin:0 auto; background-color:#ffffff; border:1px solid #e7e5e0; border-radius:6px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.03); }
    .header { background-color:#0d0d0e; padding:30px; text-align:center; border-bottom:2px solid #e7d3a8; }
    .logo { font-size:24px; font-weight:bold; letter-spacing:2px; color:#ffffff; text-transform:uppercase; margin:0; }
    .tagline { font-size:11px; color:#e7d3a8; text-transform:uppercase; letter-spacing:1px; margin-top:5px; }
    .content { padding:40px 30px; line-height:1.6; font-size:15px; }
    .content h2 { margin:0 0 6px 0; font-size:20px; font-weight:600; color:#0d0d0e; }
    .content .eyebrow { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#b08d4c; margin-bottom:14px; }
    .footer { background-color:#0d0d0e; color:#8c8c8c; padding:26px 30px; text-align:center; font-size:12px; border-top:1px solid #222; }
    .footer a { color:#e7d3a8; text-decoration:none; }
    table.details { width:100%; border-collapse:collapse; margin:26px 0; border:1px solid #e7e5e0; }
    table.details td { padding:12px 15px; font-size:14px; border-bottom:1px solid #f0eee9; }
    table.details td.k { font-weight:bold; color:#8c8c8c; width:34%; }
    table.details td.v { color:#1a1a1a; }
    table.details tr.total td { font-weight:bold; }
    table.details tr.total td.k { color:#0d0d0e; }
    table.details tr.total td.v { font-size:16px; color:#e7d3a8; background-color:#0d0d0e; }
    .cta { display:inline-block; background-color:#0d0d0e; color:#ffffff !important; text-decoration:none; padding:13px 28px; font-size:14px; letter-spacing:.4px; border-radius:4px; margin-top:6px; }
    .otp { margin:26px 0; padding:18px 20px; background-color:#0d0d0e; border-radius:6px; text-align:center; }
    .otp .lbl { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:rgba(255,255,255,.5); }
    .otp .code { font-family:'Courier New',monospace; font-size:32px; letter-spacing:10px; color:#e7d3a8; margin-top:6px; }
    .note { font-size:13px; color:#777; }
    .banner { padding:14px 16px; border-radius:6px; font-size:14px; margin:22px 0; }
    .banner.warn { background:#fbf3e6; border:1px solid #e7d3a8; color:#6b551f; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">SOPHRIA</div>
        <div class="tagline">Luxury Chauffeur Service · Southern Ontario</div>
      </div>
      <div class="content">${bodyContentHtml}</div>
      <div class="footer">
        <p style="margin:0 0 10px 0;">SophRia Chauffeur Service · Toronto &amp; Southern Ontario</p>
        <p style="margin:0;">Need assistance? Our 24/7 dispatch is at <a href="tel:+14379672334">+1 (437) 967-2334</a>, or reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

/** Reservation detail table. Rows are [label, value]; optional total row is styled. */
function detailsTable(rows: [string, string][], total?: [string, string]): string {
  const body = rows
    .filter(([, v]) => v && v !== "—")
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`)
    .join("");
  const totalRow = total
    ? `<tr class="total"><td class="k">${esc(total[0])}</td><td class="v">${esc(total[1])}</td></tr>`
    : "";
  return `<table class="details"><tbody>${body}${totalRow}</tbody></table>`;
}

function cta(url: string, label: string): string {
  if (!url) return "";
  return `<p style="margin:8px 0 0 0;"><a class="cta" href="${esc(url)}">${esc(label)}</a></p>`;
}

function otpBlock(code: string): string {
  if (!code) return "";
  return `<div class="otp"><div class="lbl">Pickup Code</div><div class="code">${esc(code)}</div></div>
    <p class="note">Share this code with your chauffeur at pickup to begin the ride. Keep it private until then.</p>`;
}

/** Plain-text body with a consistent header/footer (improves deliverability). */
function textWrap(headline: string, lines: string[]): string {
  return [
    "SOPHRIA — Luxury Chauffeur Service · Southern Ontario",
    "-----------------------------------------------------",
    headline.toUpperCase(),
    "",
    ...lines,
    "",
    "Need assistance? Contact our 24/7 dispatch at +1 (437) 967-2334.",
  ].join("\n");
}

/** Common booking fields → detail rows, reused across templates. */
function bookingRows(d: Record<string, string>, opts: { hideDropoff?: boolean } = {}): [string, string][] {
  const rows: [string, string][] = [["Reference", d.reference || "—"], ["Date & Time", d.datetime || "—"], ["Pickup", d.pickup || "—"]];
  if (!opts.hideDropoff) rows.push(["Drop-off", d.dropoff || "—"]);
  if (d.vehicle) rows.push(["Vehicle", d.vehicle]);
  return rows;
}

/* ---------------------------------------------------------------------- *
 *  Templates — one per lifecycle event
 * ---------------------------------------------------------------------- */

export const templates: Record<string, MailTemplateFn> = {
  /** Customer — booking request received (pending admin review). Incl. pickup code. */
  "booking-received": (d) => {
    const html = emailWrapper("Booking Received — SophRia", `
      <div class="eyebrow">Reservation Requested</div>
      <h2>We've received your request</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>Thank you for choosing SophRia. Your booking request has been received and is now awaiting confirmation from our dispatch team. We'll email you the moment it's confirmed.</p>
      ${detailsTable(bookingRows(d), d.fare ? ["Estimated Fare", d.fare] : undefined)}
      ${otpBlock(d.otp || "")}
      ${cta(d.ctaUrl || "", "View My Bookings")}
    `);
    const text = textWrap("Booking received", [
      `Hello ${d.customerName || "Valued Guest"},`, "",
      "Your booking request has been received and is awaiting confirmation.", "",
      `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`,
      d.dropoff ? `Drop-off: ${d.dropoff}` : "", d.vehicle ? `Vehicle: ${d.vehicle}` : "",
      d.fare ? `Estimated Fare: ${d.fare}` : "", d.otp ? `\nPickup code: ${d.otp} (share with your chauffeur at pickup)` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Admin — a new booking request needs review. */
  "booking-request-admin": (d) => {
    const html = emailWrapper("New Booking Request — SophRia", `
      <div class="eyebrow">Action Required</div>
      <h2>New booking request</h2>
      <p>A new reservation from <strong>${esc(d.customerName || "a customer")}</strong> is awaiting review.</p>
      ${detailsTable([["Reference", d.reference || "—"], ["Customer", d.customerName || "—"], ["Date & Time", d.datetime || "—"], ["Pickup", d.pickup || "—"], ["Drop-off", d.dropoff || "—"], ["Vehicle", d.vehicle || "—"]], d.fare ? ["Estimated Fare", d.fare] : undefined)}
      ${cta(d.ctaUrl || "", "Review in Admin")}
    `);
    const text = textWrap("New booking request", [
      `Customer: ${d.customerName}`, `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`,
      `Pickup: ${d.pickup}`, `Drop-off: ${d.dropoff}`, d.vehicle ? `Vehicle: ${d.vehicle}` : "",
      d.fare ? `Estimated Fare: ${d.fare}` : "", "", "Review it in the admin dashboard.",
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — booking confirmed by dispatch; full payment required to
   *  secure it. When the admin adjusted the fare, the same email carries the
   *  previous fare and the reason (no separate fare-change email is sent). */
  "booking-confirmed": (d) => {
    const fareChanged = Boolean(d.fareChangeReason);
    const html = emailWrapper("Booking Confirmed — SophRia", `
      <div class="eyebrow">Reservation Confirmed</div>
      <h2>Your booking is confirmed</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>Great news — your reservation is confirmed. To secure your booking, please complete payment of the full fare. Your chauffeur will be assigned as soon as payment is received.</p>
      ${fareChanged ? `<div class="banner warn"><strong>Fare updated:</strong> ${esc(d.fareChangeReason)}${d.previousFare ? ` — previously ${esc(d.previousFare)}.` : ""}</div>` : ""}
      <div class="banner warn">Payment required — your booking is not secured until the fare is paid.</div>
      ${detailsTable(
        [...bookingRows(d), ...(fareChanged && d.previousFare ? [["Previous Fare", d.previousFare] as [string, string]] : [])],
        d.fare ? [fareChanged ? "Updated Fare" : "Total Fare", d.fare] : undefined,
      )}
      ${otpBlock(d.otp || "")}
      ${cta(d.ctaUrl || "", "Pay Now")}
    `);
    const text = textWrap("Booking confirmed — payment required", [
      `Hello ${d.customerName || "Valued Guest"},`, "",
      "Your reservation is confirmed. To secure your booking, please complete payment of the full fare — your chauffeur will be assigned as soon as payment is received.", "",
      fareChanged ? `Fare updated: ${d.fareChangeReason}${d.previousFare ? ` (previously ${d.previousFare})` : ""}` : "",
      `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`,
      d.dropoff ? `Drop-off: ${d.dropoff}` : "", d.vehicle ? `Vehicle: ${d.vehicle}` : "",
      d.fare ? `${fareChanged ? "Updated Fare" : "Total Fare"}: ${d.fare}` : "",
      d.ctaUrl ? `\nPay now: ${d.ctaUrl}` : "",
      d.otp ? `\nPickup code: ${d.otp}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — payment received; booking secured (receipt). */
  "payment-received": (d) => {
    const html = emailWrapper("Payment Received — SophRia", `
      <div class="eyebrow">Payment Received</div>
      <h2>Thank you — your booking is secured</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>We've received your payment and your reservation is now secured. We're assigning your chauffeur and will notify you with their details shortly.</p>
      ${detailsTable([
        ...bookingRows(d),
        ...(d.tip ? [["Driver Tip (100% to your chauffeur)", d.tip] as [string, string]] : []),
        ...(d.paymentRef ? [["Payment Reference", d.paymentRef] as [string, string]] : []),
      ], d.amount ? ["Amount Paid", d.amount] : undefined)}
      ${cta(d.ctaUrl || "", "View My Bookings")}
    `);
    const text = textWrap("Payment received", [
      `Hello ${d.customerName || "Valued Guest"},`, "",
      "We've received your payment — your reservation is secured. A chauffeur will be assigned shortly.", "",
      `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`,
      d.dropoff ? `Drop-off: ${d.dropoff}` : "", d.vehicle ? `Vehicle: ${d.vehicle}` : "",
      d.tip ? `Driver Tip: ${d.tip} (100% to your chauffeur)` : "",
      d.amount ? `Amount Paid: ${d.amount}` : "", d.paymentRef ? `Payment Reference: ${d.paymentRef}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Admin — payment received; booking is ready for driver assignment. */
  "payment-received-admin": (d) => {
    const html = emailWrapper("Payment Received — SophRia", `
      <div class="eyebrow">Action Required</div>
      <h2>Payment received — assign a driver</h2>
      <p>Reservation <strong>${esc(d.reference || "")}</strong> from <strong>${esc(d.customerName || "a customer")}</strong> has been paid in full and is ready for driver assignment.</p>
      ${detailsTable([
        ["Customer", d.customerName || "—"],
        ...bookingRows(d),
        ...(d.tip ? [["Driver Tip", d.tip] as [string, string]] : []),
      ], d.amount ? ["Amount Paid", d.amount] : undefined)}
      ${cta(d.ctaUrl || "", "Assign Driver")}
    `);
    const text = textWrap("Payment received — assign driver", [
      `Reservation ${d.reference} from ${d.customerName} has been paid in full and is ready for driver assignment.`, "",
      `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`, d.dropoff ? `Drop-off: ${d.dropoff}` : "",
      d.amount ? `Amount Paid: ${d.amount}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — booking could not be fulfilled. */
  "booking-rejected": (d) => {
    const html = emailWrapper("Booking Update — SophRia", `
      <div class="eyebrow">Reservation Update</div>
      <h2>We couldn't confirm this booking</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>We're sorry — we were unable to fulfill your reservation <strong>${esc(d.reference || "")}</strong>.</p>
      ${d.reason ? `<div class="banner warn"><strong>Reason:</strong> ${esc(d.reason)}</div>` : ""}
      <p>Please feel free to book again for a different time, or contact our dispatch and we'll do our best to accommodate you.</p>
      ${cta(d.ctaUrl || "", "Book Again")}
    `);
    const text = textWrap("Booking update", [
      `Hello ${d.customerName || "Valued Guest"},`, "",
      `We were unable to fulfill reservation ${d.reference}.`, d.reason ? `Reason: ${d.reason}` : "",
      "", "You're welcome to book again or contact our dispatch.",
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — a chauffeur has been assigned. */
  "driver-assigned-customer": (d) => {
    const html = emailWrapper("Chauffeur Assigned — SophRia", `
      <div class="eyebrow">Chauffeur Assigned</div>
      <h2>A chauffeur has been assigned</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>We've assigned <strong>${esc(d.driverName || "a professional chauffeur")}</strong> to your reservation. They'll confirm shortly.</p>
      ${detailsTable([["Chauffeur", d.driverName || "—"], ...(d.driverPhone ? [["Contact", d.driverPhone] as [string, string]] : []), ...bookingRows(d)], d.fare ? ["Estimated Fare", d.fare] : undefined)}
      ${otpBlock(d.otp || "")}
      ${cta(d.ctaUrl || "", "View My Bookings")}
    `);
    const text = textWrap("Chauffeur assigned", [
      `Hello ${d.customerName || "Valued Guest"},`, "",
      `${d.driverName || "A chauffeur"} has been assigned to your reservation.`, "",
      `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`,
      d.dropoff ? `Drop-off: ${d.dropoff}` : "", d.driverPhone ? `Chauffeur contact: ${d.driverPhone}` : "",
      d.otp ? `\nPickup code: ${d.otp}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Driver — a new ride has been assigned to them. */
  "driver-assigned-driver": (d) => {
    const html = emailWrapper("New Ride Assigned — SophRia", `
      <div class="eyebrow">New Assignment</div>
      <h2>A ride has been assigned to you</h2>
      <p>Hello ${esc(d.driverName || "Driver")},</p>
      <p>You've been assigned a new ride. Please review and accept it in your driver portal.</p>
      ${detailsTable([["Reference", d.reference || "—"], ["Passenger", d.passengerName || "—"], ["Date & Time", d.datetime || "—"], ["Pickup", d.pickup || "—"], ["Drop-off", d.dropoff || "—"], ["Vehicle", d.vehicle || "—"]])}
      ${cta(d.ctaUrl || "", "Open Driver Portal")}
    `);
    const text = textWrap("New ride assigned", [
      `Hello ${d.driverName || "Driver"},`, "", "You've been assigned a new ride — review and accept it in your portal.", "",
      `Reference: ${d.reference}`, `Passenger: ${d.passengerName}`, `Date & Time: ${d.datetime}`,
      `Pickup: ${d.pickup}`, `Drop-off: ${d.dropoff}`, d.vehicle ? `Vehicle: ${d.vehicle}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — the assigned chauffeur accepted the ride. */
  "driver-accepted-customer": (d) => {
    const html = emailWrapper("Chauffeur Confirmed — SophRia", `
      <div class="eyebrow">Ride Confirmed</div>
      <h2>Your chauffeur confirmed your ride</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p><strong>${esc(d.driverName || "Your chauffeur")}</strong> has accepted your reservation and will be there at the scheduled time.</p>
      ${detailsTable([["Chauffeur", d.driverName || "—"], ...(d.driverPhone ? [["Contact", d.driverPhone] as [string, string]] : []), ["Reference", d.reference || "—"], ["Date & Time", d.datetime || "—"], ["Pickup", d.pickup || "—"]])}
      ${otpBlock(d.otp || "")}
      ${cta(d.ctaUrl || "", "View My Bookings")}
    `);
    const text = textWrap("Chauffeur confirmed", [
      `Hello ${d.customerName || "Valued Guest"},`, "",
      `${d.driverName || "Your chauffeur"} has accepted your reservation.`, "",
      `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`,
      d.driverPhone ? `Chauffeur contact: ${d.driverPhone}` : "", d.otp ? `\nPickup code: ${d.otp}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Admin — the assigned driver declined; ride returned to dispatch. */
  "driver-declined-admin": (d) => {
    const html = emailWrapper("Ride Declined — SophRia", `
      <div class="eyebrow">Action Required</div>
      <h2>A chauffeur declined a ride</h2>
      <p><strong>${esc(d.driverName || "A driver")}</strong> declined reservation <strong>${esc(d.reference || "")}</strong>. It has been returned to dispatch and needs a new chauffeur.</p>
      ${detailsTable([["Reference", d.reference || "—"], ["Customer", d.customerName || "—"], ["Date & Time", d.datetime || "—"], ["Pickup", d.pickup || "—"], ["Drop-off", d.dropoff || "—"]])}
      ${cta(d.ctaUrl || "", "Reassign in Admin")}
    `);
    const text = textWrap("Ride declined", [
      `${d.driverName || "A driver"} declined reservation ${d.reference}. Please reassign.`, "",
      `Customer: ${d.customerName}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`, `Drop-off: ${d.dropoff}`,
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — ride completed. */
  "ride-completed": (d) => {
    const html = emailWrapper("Ride Complete — SophRia", `
      <div class="eyebrow">Thank You</div>
      <h2>We hope you enjoyed the ride</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>Your journey with SophRia is complete. Thank you for travelling with us — it was our privilege to be your chauffeur.</p>
      ${detailsTable(bookingRows(d), d.fare ? ["Total Fare", d.fare] : undefined)}
      <p>We'd love to welcome you again soon.</p>
      ${cta(d.ctaUrl || "", "Book Your Next Ride")}
    `);
    const text = textWrap("Ride complete", [
      `Hello ${d.customerName || "Valued Guest"},`, "", "Your journey with SophRia is complete. Thank you for travelling with us.", "",
      `Reference: ${d.reference}`, `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`,
      d.dropoff ? `Drop-off: ${d.dropoff}` : "", d.fare ? `Total Fare: ${d.fare}` : "",
    ].filter(Boolean));
    return { html, text };
  },

  /** Customer — booking cancelled. */
  "booking-cancelled": (d) => {
    const html = emailWrapper("Booking Cancelled — SophRia", `
      <div class="eyebrow">Reservation Cancelled</div>
      <h2>Your booking has been cancelled</h2>
      <p>Hello ${esc(d.customerName || "Valued Guest")},</p>
      <p>Your reservation <strong>${esc(d.reference || "")}</strong> has been cancelled. No further action is needed.</p>
      ${detailsTable(bookingRows(d))}
      <p class="note">If you didn't request this cancellation, please contact our dispatch right away.</p>
      ${cta(d.ctaUrl || "", "Book Again")}
    `);
    const text = textWrap("Booking cancelled", [
      `Hello ${d.customerName || "Valued Guest"},`, "", `Reservation ${d.reference} has been cancelled.`, "",
      `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`, "", "If this wasn't you, contact dispatch immediately.",
    ].filter(Boolean));
    return { html, text };
  },

  /** Admin — a booking was cancelled by the customer. */
  "booking-cancelled-admin": (d) => {
    const html = emailWrapper("Booking Cancelled — SophRia", `
      <div class="eyebrow">Notice</div>
      <h2>A booking was cancelled</h2>
      <p>Reservation <strong>${esc(d.reference || "")}</strong> from <strong>${esc(d.customerName || "a customer")}</strong> was cancelled.</p>
      ${detailsTable([["Reference", d.reference || "—"], ["Customer", d.customerName || "—"], ["Date & Time", d.datetime || "—"], ["Pickup", d.pickup || "—"], ["Drop-off", d.dropoff || "—"]])}
    `);
    const text = textWrap("Booking cancelled", [
      `Reservation ${d.reference} from ${d.customerName} was cancelled.`, "",
      `Date & Time: ${d.datetime}`, `Pickup: ${d.pickup}`, `Drop-off: ${d.dropoff}`,
    ].filter(Boolean));
    return { html, text };
  },

  /** Applicant — chauffeur application received. */
  "driver-application-received": (d) => {
    const html = emailWrapper("Application Received — SophRia", `
      <div class="eyebrow">Drive With Us</div>
      <h2>We've received your application</h2>
      <p>Hello ${esc(d.applicantName || "there")},</p>
      <p>Thank you for applying to join SophRia's private fleet. Our team will review your details and be in touch. We appreciate your interest in driving with us.</p>
      ${cta(d.ctaUrl || "", "Visit SophRia")}
    `);
    const text = textWrap("Application received", [
      `Hello ${d.applicantName || "there"},`, "", "Thank you for applying to join SophRia's fleet. Our team will review your details and be in touch.",
    ]);
    return { html, text };
  },

  /** Admin — a new chauffeur application was submitted. */
  "driver-application-admin": (d) => {
    const html = emailWrapper("New Chauffeur Application — SophRia", `
      <div class="eyebrow">Action Required</div>
      <h2>New chauffeur application</h2>
      <p>A new application has been submitted and is ready for review.</p>
      ${detailsTable([["Applicant", d.applicantName || "—"], ["Email", d.applicantEmail || "—"]])}
      ${cta(d.ctaUrl || "", "Review in Admin")}
    `);
    const text = textWrap("New chauffeur application", [
      `Applicant: ${d.applicantName}`, `Email: ${d.applicantEmail}`, "", "Review it in the admin dashboard.",
    ].filter(Boolean));
    return { html, text };
  },

  /** Kept for backward-compat with the original scaffold. */
  "booking-confirmation": (d) => templates["booking-confirmed"](d),

  /** Generic fallback. */
  generic: (d) => {
    const heading = d.heading || "Notification";
    const body = d.body || "";
    const html = emailWrapper(heading, `
      <h2>${esc(heading)}</h2>
      <div>${body.split("\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      ${cta(d.ctaUrl || "", d.ctaLabel || "")}
    `);
    const text = textWrap(heading, [body]);
    return { html, text };
  },
};
