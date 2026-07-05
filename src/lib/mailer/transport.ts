import 'server-only'; // SMTP transport must never reach the client bundle
import nodemailer from 'nodemailer';
import { getSMTPConfig } from './config';

let transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const config = getSMTPConfig();

  // If port is 465, it uses implicit SSL/TLS.
  // Otherwise, it uses STARTTLS upgrade (which is default for port 587).
  const secure = config.port === 465;

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    pool: true, // Use a pool of connections to keep TCP connections open
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: 5, // Max 5 messages per second
  });

  return transporter;
}
