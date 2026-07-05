export interface MailOptions {
  to: string | string[];          // recipient(s)
  subject: string;
  html?: string;                  // raw HTML body
  text?: string;                  // plain-text fallback
  template?: {                    // OR use a named template
    name: string;
    data: Record<string, string>;
  };
  from?: string;                  // override default sender
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
