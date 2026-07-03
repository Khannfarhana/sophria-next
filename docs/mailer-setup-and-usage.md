# Mailer Configuration & Usage Guide

This document describes how to configure, test, and use the SophRia email notification system.

---

## 1. SMTP Setup & Environment Configuration

Email sending is handled by `nodemailer` and configured entirely via environment variables.

### Port Selection
* **Port 587 (STARTTLS):** Often blocked/timed out (`ETIMEDOUT`) by residential ISPs, cloud providers (like AWS, GCP), or office network firewalls.
* **Port 465 (SSL/TLS):** **Recommended.** Most environments leave Port 465 open. 

### Configuration Variables (`.env`)
Add or update the following keys in your root `.env` file:

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
A test script is provided in the repository to check SMTP credentials and send test emails.

* **Send to Default SMTP User:**
  ```bash
  npx tsx scripts/test-mailer.ts
  ```
* **Send to a Custom Recipient:**
  ```bash
  npx tsx scripts/test-mailer.ts recipient@domain.com
  ```
