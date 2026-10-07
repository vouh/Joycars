import 'server-only';
import type { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import type { Prisma, StaffProfile } from '@/lib/generated/prisma/client';
import { ApiError, notFound } from '@/lib/http';
import { formatNairobi } from '@/lib/time';
import type { adminLeadListSchema } from '@/lib/validation/lead';
import { requeueDelivery } from './lead-delivery';

/**
 * Minimal captured-enquiry inbox — a fallback while the business system is
 * unavailable, not a CRM pipeline (no statuses, assignment or notes).
 */
const inboxInclude = {
  vehicle: { select: { id: true, slug: true, make: true, model: true, year: true, availability: true } },
  delivery: { select: { state: true, attempts: true, nextAttemptAt: true, lastError: true, deliveredAt: true } },
  payments: { select: { id: true, status: true, amountKes: true, mpesaReceipt: true, resultDesc: true, paidAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.LeadInclude;

function where(q: z.infer<typeof adminLeadListSchema>): Prisma.LeadWhereInput {
  return {
    type: q.upcoming ? 'viewing' : q.type,
    vehicleId: q.vehicleId,
    ...(q.upcoming && { preferredViewingAt: { gte: new Date() } }),
    ...(q.deliveryState && { delivery: { state: q.deliveryState } }),
  };
}

export async function listLeads(q: z.infer<typeof adminLeadListSchema>) {
  const w = where(q);
  const orderBy: Prisma.LeadOrderByWithRelationInput[] = q.upcoming ? [{ preferredViewingAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }];
  const [total, rows] = await db.$transaction([
    db.lead.count({ where: w }),
    db.lead.findMany({ where: w, include: inboxInclude, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return {
    items: rows.map(l => ({ ...l, preferredViewingLocal: l.preferredViewingAt ? formatNairobi(l.preferredViewingAt) : null })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Headline counts for the admin dashboard. */
export async function leadStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [upcomingViewings, newThisWeek, viewingRequests, enquiries] = await db.$transaction([
    db.lead.count({ where: { type: 'viewing', preferredViewingAt: { gte: now } } }),
    db.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    db.lead.count({ where: { type: 'viewing' } }),
    db.lead.count({ where: { type: 'enquiry' } }),
  ]);
  return { upcomingViewings, newThisWeek, viewingRequests, enquiries };
}

export async function getLead(id: string) {
  const lead = await db.lead.findUnique({ where: { id }, include: inboxInclude });
  if (!lead) throw notFound('Enquiry');
  return { ...lead, preferredViewingLocal: lead.preferredViewingAt ? formatNairobi(lead.preferredViewingAt) : null };
}

const EXPORT_LIMIT = 5000;

function paymentSummary(payments: { status: string; amountKes: number }[]) {
  const p = payments.find(x => x.status === 'paid') ?? payments[0];
  return p ? `${p.status} (KES ${p.amountKes})` : '';
}

/** Neutralizes spreadsheet formula injection and escapes CSV. */
function csvCell(value: unknown) {
  let s = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportLeadsCsv(staff: StaffProfile, q: z.infer<typeof adminLeadListSchema>) {
  const rows = await db.lead.findMany({ where: where(q), include: inboxInclude, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT });
  await db.$transaction(tx => recordAudit(tx, { actorId: staff.id, action: 'lead.exported', entityType: 'lead', entityId: 'export', changes: { count: rows.length, filters: { type: q.type ?? null, deliveryState: q.deliveryState ?? null } } }));
  const header = ['Lead ID', 'Received (UTC)', 'Type', 'Name', 'Phone', 'Email', 'Vehicle', 'Preferred viewing (Nairobi)', 'Message', 'Confirmation email sent (UTC)', 'Viewing fee', 'M-Pesa receipt', 'Delivery state', 'Upstream ID', 'UTM source', 'UTM medium', 'UTM campaign'];
  const lines = rows.map(l => [
    l.id, l.createdAt, l.type, l.name, l.phone, l.email,
    l.vehicle ? `${l.vehicle.year ?? ''} ${l.vehicle.make} ${l.vehicle.model}`.trim() : '',
    l.preferredViewingAt ? formatNairobi(l.preferredViewingAt) : '',
    l.message, l.confirmationSentAt, paymentSummary(l.payments), l.payments.find(p => p.status === 'paid')?.mpesaReceipt, l.delivery?.state, l.upstreamId, l.utmSource, l.utmMedium, l.utmCampaign,
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}

export async function retryLeadDelivery(staff: StaffProfile, leadId: string) {
  const delivery = await db.leadDelivery.findUnique({ where: { leadId }, select: { state: true } });
  if (!delivery) throw notFound('Enquiry');
  if (delivery.state === 'delivered') throw new ApiError(409, 'already_delivered', 'This enquiry has already been delivered.');
  await requeueDelivery(leadId);
  await db.$transaction(tx => recordAudit(tx, { actorId: staff.id, action: 'lead.delivery_requeued', entityType: 'lead', entityId: leadId, changes: { from: delivery.state } }));
}
