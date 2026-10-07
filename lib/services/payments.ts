import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Prisma, type Payment, type PaymentStatus } from '@/lib/generated/prisma/client';
import { ApiError, notFound } from '@/lib/http';
import { createDarajaClient, DarajaError, outcomeForResultCode, parseStkCallback, toMpesaMsisdn, type DarajaClient } from '@/lib/integrations/daraja';

/** Query M-Pesa for a pending payment only after the prompt has had time to complete. */
const QUERY_AFTER_MS = 45_000;
const MIN_QUERY_INTERVAL_MS = 20_000;
/** Give up waiting after this long; a late success callback can still mark it paid. */
const GIVE_UP_AFTER_MS = 15 * 60_000;

type MpesaSettings = { client: DarajaClient; feeKes: number; callbackSecret: string };

let cached: { key: string; settings: MpesaSettings | null } | undefined;

/** Null when M-Pesa isn't fully configured: viewings then proceed without a fee. */
export function mpesa(): MpesaSettings | null {
  const e = env();
  const key = [e.MPESA_ENV, e.MPESA_CONSUMER_KEY, e.MPESA_SHORTCODE, e.MPESA_TILL_NUMBER, e.VIEWING_FEE_KES, e.MPESA_CALLBACK_BASE_URL].join('|');
  if (cached?.key === key) return cached.settings;
  let settings: MpesaSettings | null = null;
  if (e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && e.MPESA_SHORTCODE && e.MPESA_PASSKEY && e.MPESA_CALLBACK_SECRET && e.VIEWING_FEE_KES) {
    const base = new URL(e.MPESA_CALLBACK_BASE_URL ?? e.APP_URL);
    // Safaricom only calls public HTTPS URLs. (Path avoids the words "mpesa"/"safaricom", which Daraja rejects.)
    const callbackUrl = new URL(`/api/payments/callback/${e.MPESA_CALLBACK_SECRET}`, base).toString();
    settings = {
      feeKes: e.VIEWING_FEE_KES,
      callbackSecret: e.MPESA_CALLBACK_SECRET,
      client: createDarajaClient({
        environment: e.MPESA_ENV,
        consumerKey: e.MPESA_CONSUMER_KEY,
        consumerSecret: e.MPESA_CONSUMER_SECRET,
        shortCode: e.MPESA_SHORTCODE,
        tillNumber: e.MPESA_TILL_NUMBER ?? e.MPESA_SHORTCODE,
        passkey: e.MPESA_PASSKEY,
        callbackUrl,
        baseUrl: e.NODE_ENV === 'production' ? undefined : e.MPESA_API_BASE_URL,
      }),
    };
    if (base.protocol !== 'https:') console.warn('[payments] callback URL is not HTTPS; Safaricom will not deliver callbacks (status checks still work).');
  }
  cached = { key, settings };
  return settings;
}

export type PublicPayment = {
  paymentId: string;
  status: PaymentStatus;
  amountKes: number;
  message: string;
};

const MESSAGES: Record<PaymentStatus, string> = {
  pending: 'Check your phone and enter your M-Pesa PIN to pay the viewing fee.',
  paid: 'Payment received. Our team will confirm your viewing time.',
  cancelled: 'The M-Pesa payment was cancelled. You can try again.',
  expired: 'The M-Pesa prompt expired before it was completed. You can try again.',
  failed: 'The M-Pesa payment did not go through. You can try again.',
};

/** Buyer-safe view: no phone number, receipt or provider details. */
export function toPublicPayment(p: Pick<Payment, 'id' | 'status' | 'amountKes'>): PublicPayment {
  return { paymentId: p.id, status: p.status, amountKes: p.amountKes, message: MESSAGES[p.status] };
}

/**
 * Sends an STK Push for a viewing request's booking fee. Safe to call
 * repeatedly: an in-flight or completed payment is returned instead of
 * charging again (also enforced by a partial unique index).
 */
export async function startViewingFeePayment(leadId: string, phoneOverride?: string): Promise<PublicPayment> {
  const settings = mpesa();
  if (!settings) throw new ApiError(503, 'payments_unavailable', 'M-Pesa payments are not available right now. Our team will contact you about your viewing.');

  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { id: true, type: true, phone: true } });
  if (!lead) throw notFound('Booking');
  if (lead.type !== 'viewing') throw new ApiError(422, 'not_a_viewing', 'Only viewing requests have a booking fee.');

  const active = await db.payment.findFirst({ where: { leadId, status: { in: ['pending', 'paid'] } } });
  if (active) return toPublicPayment(active);

  const msisdn = toMpesaMsisdn(phoneOverride ?? lead.phone);
  if (!msisdn) throw new ApiError(422, 'phone_not_mpesa', 'Enter a Kenyan Safaricom number (07… or 01…) to pay with M-Pesa.', { fields: { phone: 'Enter a Kenyan Safaricom number to pay with M-Pesa.' } });

  let payment: Payment;
  try {
    payment = await db.payment.create({ data: { leadId, amountKes: settings.feeKes, msisdn, purpose: 'viewing_fee' } });
  } catch (error) {
    // A concurrent request created the active payment first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await db.payment.findFirst({ where: { leadId, status: { in: ['pending', 'paid'] } } });
      if (winner) return toPublicPayment(winner);
    }
    throw error;
  }

  try {
    const { merchantRequestId, checkoutRequestId } = await settings.client.stkPush({
      msisdn,
      amountKes: settings.feeKes,
      accountReference: `JC${leadId.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      description: 'Viewing fee',
    });
    payment = await db.payment.update({ where: { id: payment.id }, data: { merchantRequestId, checkoutRequestId } });
    return toPublicPayment(payment);
  } catch (error) {
    const desc = (error instanceof DarajaError ? error.message : 'Could not reach M-Pesa').slice(0, 300);
    await db.payment.update({ where: { id: payment.id }, data: { status: 'failed', resultDesc: desc } });
    console.error('[payments] STK push failed', { paymentId: payment.id, error: desc });
    throw new ApiError(502, 'payment_not_started', 'We could not send the M-Pesa prompt. Your viewing request is saved — please try the payment again.', { leadId });
  }
}

/** Constant-time check of the secret callback path segment. */
export function callbackTokenValid(token: string) {
  const settings = mpesa();
  if (!settings) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(settings.callbackSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function settle(payment: Payment, resultCode: number, resultDesc: string, extra: { receipt?: string | null } = {}) {
  const outcome = outcomeForResultCode(resultCode);
  // Only pending payments move; a late success may still upgrade an abandoned one.
  const movable: PaymentStatus[] = outcome === 'paid' ? ['pending', 'expired', 'failed'] : ['pending'];
  const data = {
    status: outcome,
    resultCode,
    resultDesc: resultDesc.slice(0, 300),
    ...(outcome === 'paid' && { paidAt: new Date(), mpesaReceipt: extra.receipt ?? undefined }),
  };
  try {
    const updated = await db.payment.updateMany({ where: { id: payment.id, status: { in: movable } }, data });
    if (updated.count && outcome === 'paid') console.info('[payments] viewing fee paid', { paymentId: payment.id, leadId: payment.leadId });
    return updated.count > 0;
  } catch (error) {
    if (!(outcome === 'paid' && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    return settleLateSuccess(payment, data);
  }
}

/**
 * Money arrived for a payment we had given up on, while the buyer already has
 * another active payment. Money received is the truth: supersede an unpaid
 * retry, or flag a genuine double payment for a refund. Never drop it.
 */
async function settleLateSuccess(payment: Payment, data: Prisma.PaymentUpdateManyMutationInput) {
  return db.$transaction(async tx => {
    const other = await tx.payment.findFirst({ where: { leadId: payment.leadId, id: { not: payment.id }, status: { in: ['pending', 'paid'] } } });
    if (other?.status === 'pending') {
      await tx.payment.update({ where: { id: other.id }, data: { status: 'cancelled', resultDesc: 'Superseded by an earlier payment that completed' } });
      await tx.payment.update({ where: { id: payment.id }, data });
      return true;
    }
    // Both completed: keep the receipt on record and flag for a refund.
    await tx.payment.update({
      where: { id: payment.id },
      data: { mpesaReceipt: data.mpesaReceipt, resultCode: 0, resultDesc: 'DUPLICATE PAYMENT — refund required (another payment for this booking is already paid)' },
    });
    console.error('[payments] duplicate viewing fee received; refund required', { paymentId: payment.id, leadId: payment.leadId });
    return false;
  });
}

/** Handles Safaricom's STK callback. Always acknowledge; never trust it blindly. */
export async function handleStkCallback(body: unknown) {
  const cb = parseStkCallback(body);
  if (!cb) return { handled: false, reason: 'not an STK callback' };
  const payment = await db.payment.findUnique({ where: { checkoutRequestId: cb.checkoutRequestId } });
  if (!payment) return { handled: false, reason: 'unknown CheckoutRequestID' };

  if (cb.resultCode === 0 && cb.amount !== null && cb.amount !== payment.amountKes) {
    console.error('[payments] amount mismatch in callback', { paymentId: payment.id, expected: payment.amountKes, received: cb.amount });
    await db.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'failed', resultCode: cb.resultCode, resultDesc: `Amount mismatch: received ${cb.amount}` } });
    return { handled: true, reason: 'amount mismatch' };
  }
  try {
    await settle(payment, cb.resultCode, cb.resultDesc, { receipt: cb.receipt });
  } catch (error) {
    // Duplicate receipt number: the same transaction was already recorded.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }
  return { handled: true };
}

/** Asks M-Pesa for the result when no callback arrived (lost callback, local dev, outage). */
export async function reconcilePayment(payment: Payment, now = Date.now()): Promise<Payment> {
  const settings = mpesa();
  if (!settings || payment.status !== 'pending' || !payment.checkoutRequestId) return payment;
  const age = now - payment.createdAt.getTime();
  if (age < QUERY_AFTER_MS) return payment;
  if (payment.lastQueriedAt && now - payment.lastQueriedAt.getTime() < MIN_QUERY_INTERVAL_MS) return payment;

  await db.payment.update({ where: { id: payment.id }, data: { lastQueriedAt: new Date(now) } });
  try {
    const result = await settings.client.stkQuery(payment.checkoutRequestId);
    if (result) await settle(payment, result.resultCode, result.resultDesc);
    else if (age > GIVE_UP_AFTER_MS) await settle(payment, 1037, 'No confirmation received from M-Pesa');
  } catch (error) {
    console.error('[payments] status query failed', { paymentId: payment.id, error: error instanceof Error ? error.message : 'unknown' });
    if (age > GIVE_UP_AFTER_MS) await settle(payment, 1037, 'No confirmation received from M-Pesa');
  }
  return db.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

/** Buyer polling endpoint: current status, reconciling with M-Pesa if needed. */
export async function getPaymentStatus(paymentId: string): Promise<PublicPayment> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound('Payment');
  return toPublicPayment(await reconcilePayment(payment));
}

/** Cron safety net for pending payments. */
export async function reconcilePendingPayments(limit = 20) {
  if (!mpesa()) return { enabled: false, checked: 0 };
  const pending = await db.payment.findMany({
    where: { status: 'pending', createdAt: { lte: new Date(Date.now() - QUERY_AFTER_MS) } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  for (const p of pending) await reconcilePayment(p);
  return { enabled: true, checked: pending.length };
}
