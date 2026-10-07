import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { ApiError, json, route } from '@/lib/http';
import { purgeExpiredRateLimits } from '@/lib/rate-limit';
import { deliverPendingLeads } from '@/lib/services/lead-delivery';
import { sendPendingConfirmations } from '@/lib/services/lead-emails';
import { reconcilePendingPayments } from '@/lib/services/payments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(header: string | null) {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Scheduled worker: `Authorization: Bearer $CRON_SECRET`. Run every few minutes. */
export const GET = route(async req => {
  if (!authorized(req.headers.get('authorization'))) throw new ApiError(401, 'unauthorized', 'Unauthorized.');
  const delivery = await deliverPendingLeads({ limit: 50 });
  const confirmations = await sendPendingConfirmations();
  const payments = await reconcilePendingPayments();
  await purgeExpiredRateLimits();
  return json({ delivery, confirmations, payments });
});

export const POST = GET;
