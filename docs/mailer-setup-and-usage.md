# Mailer Configuration & Usage Guide

This document describes how to configure, test, and use the SophRia email notification system, as well as recent refactoring work to ensure type safety.

---

## 1. What Was Changed (Refactoring Summary)

To comply with strict TypeScript/ESLint guidelines and prevent potential runtime exceptions, we performed the following code improvements:

### Type Safety Upgrades
* **Unsafe Catch Blocks Resolved:** Removed explicit `error: any` from `catch` blocks in both the mailer package and client components:
  * In [send.ts](file:///Users/ankit/Projects/sophria-rides/next-sophria/src/lib/mailer/send.ts#L60), updated to `catch (error: unknown)` and utilized safe type guards to retrieve the error message (`error instanceof Error ? error.message : String(error)`).
  * In the [dashboard page](file:///Users/ankit/Projects/sophria-rides/next-sophria/src/app/(customer)/dashboard/page.tsx#L55), caught exceptions safely and normalized error handling.
* **Component Prop Alignment:**
  * Updated [BookingDetailDialog.tsx](file:///Users/ankit/Projects/sophria-rides/next-sophria/src/components/site/BookingDetailDialog.tsx#L45-L50)'s `BookingRow` interface to support rejection fields (`rejection_reason` and `rejection_notes`).
  * Mapped and typed the Supabase query results to `BookingRow[]` inside the dashboard's `useQuery` query function. This guarantees compatibility and resolves type-checking mismatches between the query data and the dialog's expectations.

### Performance & React Compliance
* **Cascading Effects Fixed:** Removed synchronous `setState()` calls inside `useEffect()` hooks in [BookingDetailDialog.tsx](file:///Users/ankit/Projects/sophria-rides/next-sophria/src/components/site/BookingDetailDialog.tsx#L73-L100).
* **Render-Phase Synchronization:** Optimized state copying and resets when booking properties or the dialog state changes. The dialog now utilizes React's standard "adjust state during render" pattern by checking previous keys (`prevBookingId`, `prevDriverId`, `prevOpen`).
* **Clean Imports:** Removed unused imports (e.g., `Luggage` from `lucide-react`).

---

## 2. SMTP Setup & Environment Configuration

Email sending is handled by `nodemailer` and configured entirely via environment variables.

### Port Selection (Important)
* **Port 587 (STARTTLS):** Often blocked/timed out (`ETIMEDOUT`) by residential ISPs, cloud providers (like AWS, GCP), or office network firewalls.
* **Port 465 (SSL/TLS):** **Recommended.** Most environments leave Port 465 open. 

### Configuration Variables (`.env`)
Add or update the following keys at the root `.env` file:

```env
# SMTP Mailer Settings
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-16-character-app-password" # WITHOUT SPACES
SMTP_FROM="SophRia <your-email@gmail.com>"
```

> [!IMPORTANT]
> When using a Gmail account:
> 1. **2-Step Verification** must be **enabled** on your Google Account.
> 2. You must generate a **16-character App Password** (under Google Account -> Security -> App Passwords).
> 3. Enter the App Password in `SMTP_PASS` **without spaces** (e.g. `snvztvktoddswjum` instead of `snvz tvkt odds wjum`).

---

## 3. How to Use the Mailer in Code

Imports should be resolved from `@/lib/mailer`.

### Basic Example (Raw HTML or Text)
```typescript
import { sendMail } from "@/lib/mailer";

const result = await sendMail({
  to: "recipient@example.com",
  subject: "Welcome to SophRia Chauffeur Service",
  html: "<h1>Welcome!</h1><p>We are thrilled to serve you.</p>",
  text: "Welcome! We are thrilled to serve you."
});

if (result.success) {
  console.log("Email sent successfully! Message ID:", result.messageId);
} else {
  console.error("Failed to send email:", result.error);
}
```

### Advanced Example (Using Templates)
The mailer supports predefined rich-text HTML templates defined in `src/lib/mailer/templates.ts`. 

```typescript
import { sendMail } from "@/lib/mailer";

const result = await sendMail({
  to: "customer@example.com",
  subject: "Booking Confirmed — SophRia",
  template: {
    name: "booking-confirmation",
    data: {
      customerName: "Premium Guest",
      reference: "SR-777-XYZ",
      pickup: "100 Front Street West, Toronto, ON",
      dropoff: "Toronto Pearson International Airport (YYZ)",
      datetime: "Friday, July 10, 2026 at 6:00 PM EST",
      vehicle: "Mercedes-Benz S-Class Chauffeur",
      fare: "$150.00 CAD"
    }
  }
});
```

Available templates:
* `'booking-confirmation'`: For customer booking summaries.
* `'generic'`: Accepts `heading` and `body` placeholders for custom messaging.

---

## 4. Testing the Mailer

A standalone script is provided in the repository to check SMTP credentials and send test emails.

### Send to Default SMTP User
To test if credentials work by sending an email to the configured `SMTP_USER` email address:
```bash
npx tsx scripts/test-mailer.ts
```

### Send to a Custom Recipient
To test delivery to a specific external recipient:
```bash
npx tsx scripts/test-mailer.ts recipient@domain.com
```
