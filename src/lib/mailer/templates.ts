export interface TemplateResult {
  html: string;
  text: string;
}

export type MailTemplateFn = (data: Record<string, string>) => TemplateResult;

// Common layout wrapper for SophRia email aesthetics (luxury dark header, gold borders, clean typography)
function emailWrapper(title: string, bodyContentHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #faf9f6;
      color: #1a1a1a;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #faf9f6;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e7e5e0;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    }
    .header {
      background-color: #0d0d0e;
      padding: 30px;
      text-align: center;
      border-bottom: 2px solid #e7d3a8;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 2px;
      color: #ffffff;
      text-transform: uppercase;
      margin: 0;
    }
    .tagline {
      font-size: 11px;
      color: #e7d3a8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 5px;
    }
    .content {
      padding: 40px 30px;
      line-height: 1.6;
    }
    .footer {
      background-color: #0d0d0e;
      color: #8c8c8c;
      padding: 30px;
      text-align: center;
      font-size: 12px;
      border-top: 1px solid #222;
    }
    .footer a {
      color: #e7d3a8;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">SOPHRIA</div>
        <div class="tagline">Toronto Chauffeur Service</div>
      </div>
      <div class="content">
        ${bodyContentHtml}
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px 0;">SophRia Chauffeur Service · Toronto, ON</p>
        <p style="margin: 0;">Need assistance? Contact our 24/7 dispatch at <a href="tel:+14165550188">+1 (416) 555-0188</a> or reply directly to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export const templates: Record<string, MailTemplateFn> = {
  /**
   * Booking Confirmation Template
   * Placeholders: customerName, reference, pickup, dropoff, datetime, vehicle, fare
   */
  'booking-confirmation': (data) => {
    const customerName = data.customerName || 'Valued Guest';
    const reference = data.reference || 'N/A';
    const pickup = data.pickup || 'TBD';
    const dropoff = data.dropoff || 'TBD';
    const datetime = data.datetime || 'TBD';
    const vehicle = data.vehicle || 'Luxury Vehicle';
    const fare = data.fare || 'TBD';

    const html = emailWrapper(
      'Booking Confirmed — SophRia',
      `
      <h2 style="margin-top: 0; font-size: 20px; font-weight: 600; color: #0d0d0e;">Booking Confirmed</h2>
      <p>Hello ${customerName},</p>
      <p>Thank you for choosing SophRia. Your chauffeur service booking has been confirmed. Below are your reservation details for your reference.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 30px 0; border: 1px solid #e7e5e0;">
        <thead>
          <tr style="background-color: #fcfbf9;">
            <th colspan="2" style="text-align: left; padding: 12px 15px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #8c8c8c; border-bottom: 1px solid #e7e5e0;">Reservation ID: ${reference}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 12px 15px; font-size: 14px; font-weight: bold; color: #8c8c8c; width: 30%; border-bottom: 1px solid #f0eee9;">Date & Time</td>
            <td style="padding: 12px 15px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f0eee9;">${datetime}</td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; font-size: 14px; font-weight: bold; color: #8c8c8c; border-bottom: 1px solid #f0eee9;">Pickup</td>
            <td style="padding: 12px 15px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f0eee9;">${pickup}</td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; font-size: 14px; font-weight: bold; color: #8c8c8c; border-bottom: 1px solid #f0eee9;">Drop-off</td>
            <td style="padding: 12px 15px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f0eee9;">${dropoff}</td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; font-size: 14px; font-weight: bold; color: #8c8c8c; border-bottom: 1px solid #f0eee9;">Vehicle Class</td>
            <td style="padding: 12px 15px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f0eee9;">${vehicle}</td>
          </tr>
          <tr style="font-weight: bold;">
            <td style="padding: 12px 15px; font-size: 14px; color: #0d0d0e;">Total Fare</td>
            <td style="padding: 12px 15px; font-size: 16px; color: #e7d3a8; background-color: #0d0d0e;">${fare}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-bottom: 0;">A professional chauffeur will be assigned to your booking shortly. You will receive updates as the pickup time approaches.</p>
      `
    );

    const text = `
SOPHRIA - Toronto Chauffeur Service
----------------------------------
BOOKING CONFIRMATION

Hello ${customerName},

Thank you for choosing SophRia. Your chauffeur service booking has been confirmed.

Reservation ID: ${reference}
Date & Time: ${datetime}
Pickup Location: ${pickup}
Drop-off Location: ${dropoff}
Vehicle Class: ${vehicle}
Total Fare: ${fare}

Your chauffeur will be assigned shortly.
If you need immediate assistance, contact us at +1 (416) 555-0188.
    `.trim();

    return { html, text };
  },

  /**
   * Generic Template
   * Placeholders: heading, body
   */
  'generic': (data) => {
    const heading = data.heading || 'Notification';
    const body = data.body || '';

    const html = emailWrapper(
      heading,
      `
      <h2 style="margin-top: 0; font-size: 20px; font-weight: 600; color: #0d0d0e;">${heading}</h2>
      <div style="font-size: 14px; color: #1a1a1a;">
        ${body.split('\n').map(p => `<p>${p}</p>`).join('')}
      </div>
      `
    );

    const text = `
SOPHRIA - Toronto Chauffeur Service
----------------------------------
${heading.toUpperCase()}

${body}

Need assistance? Contact our 24/7 dispatch at +1 (416) 555-0188.
    `.trim();

    return { html, text };
  }
};
