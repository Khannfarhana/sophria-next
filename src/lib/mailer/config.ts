import 'server-only';

export interface ResendConfig {
  apiKey: string;
  from: string;
}

/** Where admin/dispatch notifications go. */
export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || "").trim();
}

export function getResendConfig(): ResendConfig {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.SMTP_FROM || "").trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('RESEND_API_KEY');
  if (!from) missing.push('SMTP_FROM');

  if (missing.length > 0) {
    throw new Error(
      `Resend configuration is incomplete. Missing environment variables: ${missing.join(', ')}. ` +
      `Please check your .env file.`
    );
  }

  if (!apiKey.startsWith('re_')) {
    throw new Error(
      `Invalid RESEND_API_KEY format. Resend API keys must start with "re_". ` +
      `Please verify your environment variables.`
    );
  }

  return {
    apiKey,
    from,
  };
}
