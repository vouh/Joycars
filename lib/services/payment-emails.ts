import 'server-only';
import { db } from '@/lib/db';
import { emailEnabled, sendEmail } from '@/lib/email';
import { buildPaymentReceiptEmail } from '@/lib/email-templates';

export async function sendPaymentReceipt(paymentId: string) {
  if (!emailEnabled()) return;
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { lead: { include: { vehicle: true } } } });
  if (!p || p.status !== 'paid' || !p.lead.email || p.receiptEmailSentAt || p.receiptEmailAttempts >= 5) return;
  // Resend's deduplication window is 24h; stop retries before it expires.
  if (p.paidAt && Date.now() - p.paidAt.getTime() > 23 * 3600000) return;
  await db.payment.update({ where: { id: p.id }, data: { receiptEmailAttempts: { increment: 1 } } });
  try {
    await sendEmail(buildPaymentReceiptEmail({ name: p.lead.name, email: p.lead.email, reference: p.lead.id.slice(0, 8).toUpperCase(), amountKes: p.amountKes, receipt: p.mpesaReceipt, vehicle: p.lead.vehicle ? `${p.lead.vehicle.year} ${p.lead.vehicle.make} ${p.lead.vehicle.model}` : 'Vehicle viewing' }), `payment-receipt-${p.id}`);
    await db.payment.update({ where: { id: p.id }, data: { receiptEmailSentAt: new Date() } });
  } catch { console.error('[payment-email] receipt delivery failed', { paymentId: p.id }); }
}
export async function sendPendingPaymentReceipts() {
  const due = await db.payment.findMany({ where: { status: 'paid', receiptEmailSentAt: null, receiptEmailAttempts: { lt: 5 }, paidAt: { gt: new Date(Date.now() - 23 * 3600000) } }, select: { id: true }, take: 25 });
  for (const p of due) await sendPaymentReceipt(p.id);
  return { checked: due.length };
}
