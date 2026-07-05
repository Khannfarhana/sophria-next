import { getTransporter } from './transport';
import { getSMTPConfig } from './config';
import { templates } from './templates';
import { MailOptions, MailResult } from './types';

/**
 * Sends an email using Nodemailer based on environment variable configuration.
 * Resolves templates if a template name is provided.
 * Catches all errors and returns a MailResult object.
 *
 * @param options Send configuration (to, subject, templates, attachments, etc.)
 */
export async function sendMail(options: MailOptions): Promise<MailResult> {
  try {
    // 1. Load config to retrieve the default "from" address
    const config = getSMTPConfig();
    const defaultFrom = config.from;

    // 2. Instantiate/retrieve transporter
    const transporter = getTransporter();

    // 3. Resolve template if specified
    let html = options.html;
    let text = options.text;

    if (options.template) {
      const templateFn = templates[options.template.name];
      if (!templateFn) {
        return {
          success: false,
          error: `Mail template "${options.template.name}" does not exist. Available templates: ${Object.keys(templates).join(', ')}`,
        };
      }

      const rendered = templateFn(options.template.data);
      html = rendered.html;
      text = rendered.text;
    }

    // 4. Construct email payload
    const mailPayload = {
      from: options.from || defaultFrom,
      to: options.to,
      subject: options.subject,
      html,
      text,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    };

    // 5. Send email
    const info = await transporter.sendMail(mailPayload);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: unknown) {
    console.error('[Mailer Error] Failed to send email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
