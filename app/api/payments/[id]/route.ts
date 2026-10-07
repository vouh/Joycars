import { clientIp, json, route } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getPaymentStatus } from '@/lib/services/payments';
import { uuid } from '@/lib/validation/common';

/** Buyer polls this (every ~3–5s) after the prompt; returns status only, no personal data. */
export const GET = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const paymentId = uuid.parse((await params).id);
  await enforceRateLimit('payment-status', clientIp(req), 120, 10 * 60);
  return json({ payment: await getPaymentStatus(paymentId) });
});
