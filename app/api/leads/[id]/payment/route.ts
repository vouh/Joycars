import { z } from 'zod';
import { clientIp, json, readJson, route } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { startViewingFeePayment } from '@/lib/services/payments';
import { uuid } from '@/lib/validation/common';
import { phoneSchema } from '@/lib/validation/lead';

const bodySchema = z.object({
  /** Optional different Safaricom number to charge (e.g. a family member's). */
  phone: phoneSchema.optional(),
});

/**
 * Starts (or retries) the M-Pesa booking-fee prompt for a viewing request.
 * The unguessable lead UUID returned at submission acts as the capability.
 */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const leadId = uuid.parse((await params).id);
  await enforceRateLimit('payment-ip', clientIp(req), 10, 15 * 60);
  await enforceRateLimit('payment-lead', leadId, 4, 15 * 60);
  const { phone } = bodySchema.parse(await readJson(req));
  return json({ payment: await startViewingFeePayment(leadId, phone) }, { status: 202 });
});
