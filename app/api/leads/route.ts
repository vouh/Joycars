import { after } from 'next/server';
import { db } from '@/lib/db';
import { emailEnabled } from '@/lib/email';
import { ApiError, clientIp, json, readBody, route } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { deliverPendingLeads } from '@/lib/services/lead-delivery';
import { sendLeadConfirmation } from '@/lib/services/lead-emails';
import { createLead } from '@/lib/services/leads';
import { mpesa, startViewingFeePayment, toPublicPayment, type PublicPayment } from '@/lib/services/payments';
import { leadSubmissionSchema } from '@/lib/validation/lead';
import { getViewingFee } from '@/lib/services/booking-settings';

/**
 * Public enquiry / viewing-request submission. Responds 201 only after the
 * lead is committed; delivery to the business system and the buyer's
 * confirmation email happen afterwards. When M-Pesa is configured, a viewing
 * request also triggers the booking-fee prompt on the buyer's phone.
 */
export const POST = route(async req => {
  await enforceRateLimit('lead', clientIp(req), 8, 15 * 60);
  const body = await readBody(req);
  const input = leadSubmissionSchema().parse(body);
  if (input.type === 'viewing' && !input.isBot && mpesa()) {
    const expected = (body as Record<string, unknown>).expectedViewingFeeKes;
    if (expected !== undefined && expected !== await getViewingFee()) throw new ApiError(409, 'fee_changed', 'The viewing fee has changed. Please refresh this page to review the current amount before paying.');
  }
  const { stored, ...receipt } = await createLead(input);

  if (stored && !receipt.duplicate) {
    const leadId = receipt.leadId;
    // Best-effort immediate work; the cron worker is the safety net for both.
    after(() => Promise.allSettled([deliverPendingLeads({ leadId, limit: 1 }), sendLeadConfirmation(leadId)]));
  }

  // The booking is saved either way; a payment problem never loses it.
  let payment: PublicPayment | { status: 'not_started'; message: string } | null = null;
  if (stored && receipt.type === 'viewing' && mpesa()) {
    try {
      payment = receipt.duplicate
        ? await existingOrNewPayment(receipt.leadId, (body as { expectedViewingFeeKes?: number }).expectedViewingFeeKes)
        : await startViewingFeePayment(receipt.leadId, undefined, (body as { expectedViewingFeeKes?: number }).expectedViewingFeeKes);
    } catch (error) {
      payment = { status: 'not_started', message: error instanceof ApiError ? error.message : 'We could not send the M-Pesa prompt. Please try the payment again.' };
    }
  }

  const message = input.email && stored && emailEnabled() ? `${receipt.message} We will also email you a copy of your request.` : receipt.message;
  return json({ ...receipt, message, payment }, { status: receipt.duplicate ? 200 : 201 });
});

/** A replayed submission shows the existing payment instead of charging again. */
async function existingOrNewPayment(leadId: string, expectedFeeKes?: number) {
  const active = await db.payment.findFirst({ where: { leadId, status: { in: ['pending', 'paid'] } } });
  return active ? toPublicPayment(active) : startViewingFeePayment(leadId, undefined, expectedFeeKes);
}
