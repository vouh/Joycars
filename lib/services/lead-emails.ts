import 'server-only';
import { db } from '@/lib/db';
import { EmailError, emailEnabled, sendEmail } from '@/lib/email';
import { buildConfirmationEmail } from '@/lib/email-templates';

export const MAX_CONFIRMATION_ATTEMPTS = 5;
/** Kept inside the provider's 24-hour idempotency window, so a retry can never send a second copy. */
export const CONFIRMATION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

const showroomSelect = { name: true, address: true, phone: true, hours: true } as const;

/**
 * Emails the buyer a copy of their request. Runs after the lead is committed
 * and never affects whether the submission succeeded.
 */
export async function sendLeadConfirmation(leadId: string): Promise<'sent' | 'skipped' | 'failed'> {
  if (!emailEnabled()) return 'skipped';
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, type: true, name: true, phone: true, email: true, message: true, preferredViewingAt: true,
      confirmationSentAt: true, confirmationAttempts: true, createdAt: true,
      vehicle: { select: { make: true, model: true, year: true, availability: true, location: { select: showroomSelect } } },
    },
  });
  if (!lead?.email || lead.confirmationSentAt || lead.confirmationAttempts >= MAX_CONFIRMATION_ATTEMPTS) return 'skipped';
  if (Date.now() - lead.createdAt.getTime() > CONFIRMATION_RETRY_WINDOW_MS) return 'skipped';

  const showroom = lead.vehicle?.location ?? (await db.location.findFirst({ orderBy: { name: 'asc' }, select: showroomSelect }));
  await db.lead.update({ where: { id: leadId }, data: { confirmationAttempts: { increment: 1 } } });
  try {
    await sendEmail(buildConfirmationEmail({ ...lead, email: lead.email }, showroom), `lead-confirmation-${lead.id}`);
    await db.lead.update({ where: { id: leadId }, data: { confirmationSentAt: new Date(), confirmationError: null } });
    return 'sent';
  } catch (error) {
    // Store only a customer-data-free summary of the failure.
    const safeError = (error instanceof EmailError ? error.message : 'Unexpected email error').slice(0, 500);
    const permanent = error instanceof EmailError && !error.transient;
    await db.lead.update({ where: { id: leadId }, data: { confirmationError: safeError, ...(permanent && { confirmationAttempts: MAX_CONFIRMATION_ATTEMPTS }) } });
    console.error('[lead-email] confirmation failed', { leadId, error: safeError });
    return 'failed';
  }
}

/** Cron safety net for confirmations that failed or never ran. */
export async function sendPendingConfirmations(limit = 25) {
  const result = { enabled: emailEnabled(), sent: 0, failed: 0 };
  if (!result.enabled) return result;
  const due = await db.lead.findMany({
    where: {
      email: { not: null },
      confirmationSentAt: null,
      confirmationAttempts: { lt: MAX_CONFIRMATION_ATTEMPTS },
      createdAt: { gt: new Date(Date.now() - CONFIRMATION_RETRY_WINDOW_MS) },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  for (const { id } of due) {
    const outcome = await sendLeadConfirmation(id);
    if (outcome === 'sent') result.sent++;
    if (outcome === 'failed') result.failed++;
  }
  return result;
}
