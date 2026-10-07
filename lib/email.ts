import 'server-only';
import { env } from '@/lib/env';
import type { EmailMessage } from '@/lib/email-templates';

export class EmailError extends Error {
  constructor(message: string, public readonly transient: boolean) {
    super(message);
  }
}

export function emailEnabled() {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

/**
 * Sends through Resend's HTTPS API. Resend remembers an idempotency key for
 * 24 hours, so retrying with the same key never delivers a second copy.
 */
export async function sendEmail(message: EmailMessage, idempotencyKey: string) {
  const { RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) throw new EmailError('Email is not configured', false);
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from: EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text, ...(EMAIL_REPLY_TO && { reply_to: EMAIL_REPLY_TO }) }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'network error';
    throw new EmailError(`Email provider unreachable (${reason})`, true);
  }
  if (!res.ok) throw new EmailError(`Email provider responded HTTP ${res.status}`, res.status >= 500 || res.status === 429);
}
