/**
 * Sends a sample viewing confirmation to RESEND_TEST_EMAIL (or the address
 * given as the first argument) to check the Resend setup end to end.
 *
 * Usage: npm run email:test [-- someone@example.com]
 */
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { buildConfirmationEmail } from '../lib/email-templates';

config({ path: ['.env.local', '.env'], quiet: true });

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL;
const replyTo = process.env.EMAIL_REPLY_TO || process.env.RESEND_CONTACT_TO_EMAIL;
const to = process.argv[2] || process.env.RESEND_TEST_EMAIL;

async function main() {
  if (!apiKey || !from) throw new Error('Set RESEND_API_KEY and RESEND_FROM_EMAIL (or EMAIL_FROM) in .env.local');
  if (!to) throw new Error('Set RESEND_TEST_EMAIL in .env.local or pass an address');

  const message = buildConfirmationEmail(
    {
      id: randomUUID(),
      type: 'viewing',
      name: 'Test Customer',
      phone: '+254 712 345 678',
      email: to,
      message: 'This is a test email from the JoyCars setup script.',
      preferredViewingAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      vehicle: { make: 'Toyota', model: 'Prado', year: 2019, availability: 'available' },
    },
    null,
  );

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `[TEST] ${message.subject}`, html: message.html, text: message.text, ...(replyTo && { reply_to: replyTo }) }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend responded HTTP ${res.status}: ${body}`);
  console.log(`Sent test email to ${to} from ${from}${replyTo ? ` (reply-to ${replyTo})` : ''}. Resend id: ${JSON.parse(body).id}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
