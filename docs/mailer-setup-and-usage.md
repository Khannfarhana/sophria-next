# Mailer Configuration & Usage Guide

This document describes how to configure, test, and use the SophRia email notification system.

---

## 1. Resend Setup & Environment Configuration

Email sending is handled by the official `resend` SDK and configured entirely via environment variables.

### Configuration Variables (`.env`)
Add or update the following keys in your root `.env` file:

```env
# Resend Email Configuration
RESEND_API_KEY="re_your_resend_api_key"
SMTP_FROM="Sophria <no-reply@yourdomain.com>"
```

> [!IMPORTANT]
> When using Resend:
> 1. `RESEND_API_KEY` must be your Resend API Key (starts with `re_`).
> 2. Ensure the `SMTP_FROM` address corresponds to a domain verified in your Resend Dashboard.

---

## 2. How to Use the Mailer

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

### Standalone Command Line Testing
A test script is provided in the repository to check SMTP credentials and send test emails. Because of the `server-only` import in the mailer configuration, you must run it with the `react-server` condition. We have configured an npm script for convenience:

* **Using npm script (Recommended):**
  ```bash
  npm run test-mail recipient@domain.com
  ```

* **Using direct command:**
  ```bash
  npx tsx --conditions=react-server scripts/test-mailer.ts recipient@domain.com
  ```
