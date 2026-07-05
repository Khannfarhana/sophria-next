export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Where admin/dispatch notifications go. Falls back to the SMTP account. */
export function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL || process.env.SMTP_USER || process.env.SMTP_FROM || "";
}

export function getSMTPConfig(): SMTPConfig {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('SMTP_FROM');

  if (missing.length > 0) {
    throw new Error(
      `SMTP configuration is incomplete. Missing environment variables: ${missing.join(', ')}. ` +
      `Please check your .env file.`
    );
  }

  const port = portStr ? parseInt(portStr, 10) : 587;
  if (isNaN(port)) {
    throw new Error(`Invalid SMTP_PORT specified in environment: ${portStr}`);
  }

  return {
    host: host!,
    port,
    user: user!,
    pass: pass!,
    from: from!,
  };
}
