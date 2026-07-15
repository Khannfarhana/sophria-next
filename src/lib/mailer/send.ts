import 'server-only';
import { Resend } from 'resend';
import { getResendConfig } from './config';
import { templates } from './templates';
import { MailOptions, MailResult } from './types';

let resendInstance: Resend | null = null;

function getResendClient(): Resend {
  if (resendInstance) return resendInstance;
  const config = getResendConfig();
  resendInstance = new Resend(config.apiKey);
  return resendInstance;
}

/**
 * Sends an email using the Resend SDK based on environment variable configuration.
 * Resolves templates if a template name is provided.
 * Catches all errors and returns a MailResult object.
 *
 * @param options Send configuration (to, subject, templates, attachments, etc.)
 */
export async function sendMail(options: MailOptions): Promise<MailResult> {
  try {
    // 1. Load config to retrieve the default "from" address
    const config = getResendConfig();
    const defaultFrom = config.from;

    // 2. Instantiate/retrieve Resend client
    const resend = getResendClient();

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

    // 4. Adapt attachments to Resend SDK format (filename and content Buffer/base64 string)
    const attachments = options.attachments?.map(att => ({
      filename: att.filename,
      content: att.content,
    }));

    // 5. Construct email payload
    const mailPayload = {
      from: options.from || defaultFrom,
      to: options.to,
      subject: options.subject,
      html: html || '',
      text: text,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
      attachments,
    };

    // 6. Send email via Resend SDK
    const response = await resend.emails.send(mailPayload);

    if (!response || response.error) {
      const errorMsg = response?.error?.message || 'Unknown Resend SDK error';
      console.error('[Mailer Error] Resend SDK returned error:', response?.error || 'No response returned');
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      messageId: response.data?.id,
    };
  } catch (error: unknown) {
    console.error('[Mailer Error] Failed to send email via Resend SDK:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
