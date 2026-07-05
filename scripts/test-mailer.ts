import fs from 'fs';
import path from 'path';
import { sendMail } from '../src/lib/mailer';

// Load .env manually to populate process.env for this standalone script execution
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found. Please copy .env.example to .env and configure it.');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) return;
    const key = trimmed.slice(0, firstEq).trim();
    let val = trimmed.slice(firstEq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
}

async function run() {
  loadEnv();
  
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('\nError: SMTP variables are not configured in your .env file.');
    console.error('Please configure the following in .env:');
    console.error('- SMTP_HOST');
    console.error('- SMTP_PORT');
    console.error('- SMTP_USER');
    console.error('- SMTP_PASS');
    console.error('- SMTP_FROM');
    process.exit(1);
  }

  console.log('Loaded SMTP Configuration:');
  console.log(`- Host: ${host}`);
  console.log(`- Port: ${process.env.SMTP_PORT}`);
  console.log(`- User: ${user}`);
  console.log(`- From: ${process.env.SMTP_FROM}`);
  console.log('----------------------------------------');

  const recipient = process.argv[2] || user;

  console.log('Sending test email using booking-confirmation template to:', recipient);
  
  const result = await sendMail({
    to: recipient,
    subject: 'SophRia - Standalone Chauffeur Mailer Test',
    template: {
      name: 'booking-confirmation',
      data: {
        customerName: 'Premium Guest',
        reference: 'SR-TEST-777',
        pickup: '100 Front Street West, Toronto, ON M5J 1E3',
        dropoff: 'Toronto Pearson International Airport (YYZ), Terminal 1',
        datetime: 'Friday, July 10, 2026 at 6:00 PM EST',
        vehicle: 'Mercedes-Benz S-Class Chauffeur',
        fare: '$150.00 CAD'
      }
    }
  });

  if (result.success) {
    console.log('\n========================================');
    console.log('SUCCESS! Email sent successfully.');
    console.log(`Message ID: ${result.messageId}`);
    console.log('========================================');
  } else {
    console.error('\n========================================');
    console.error('FAILURE! Failed to send email.');
    console.error(`Error: ${result.error}`);
    console.log('========================================');
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
});
