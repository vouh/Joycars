import 'server-only';
import { MAX_DELIVERY_ATTEMPTS, nextBackoffMs } from '@/lib/backoff';
import { db } from '@/lib/db';
import { DeliveryError, getBusinessSystemAdapter, type LeadPayloadV1 } from '@/lib/integrations/business-system';

const LEASE_SECONDS = 120;

/**
 * Claims due deliveries with a lease. SKIP LOCKED lets concurrent workers run
 * safely; an expired lease (crashed worker) makes the row claimable again.
 */
async function claim(limit: number, leadId?: string) {
  return db.$queryRaw<{ lead_id: string; attempts: number }[]>`
    UPDATE lead_deliveries d
    SET lease_until = now() + make_interval(secs => ${LEASE_SECONDS}::float8), attempts = d.attempts + 1, updated_at = now()
    WHERE d.lead_id IN (
      SELECT lead_id FROM lead_deliveries
      WHERE state = 'pending'
        AND next_attempt_at <= now()
        AND (lease_until IS NULL OR lease_until < now())
        AND (${leadId ?? null}::uuid IS NULL OR lead_id = ${leadId ?? null}::uuid)
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING d.lead_id, d.attempts`;
}

async function buildPayload(leadId: string): Promise<LeadPayloadV1> {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { vehicle: { select: { id: true, externalId: true, slug: true, make: true, model: true, year: true } } },
  });
  return {
    schemaVersion: 1,
    leadId: lead.id,
    submittedAt: lead.createdAt.toISOString(),
    type: lead.type,
    vehicle: lead.vehicle && { id: lead.vehicle.id, externalId: lead.vehicle.externalId, slug: lead.vehicle.slug, title: [lead.vehicle.year, lead.vehicle.make, lead.vehicle.model].filter(Boolean).join(' ') },
    buyer: { name: lead.name, phone: lead.phone, email: lead.email },
    message: lead.message,
    preferredViewingAt: lead.preferredViewingAt?.toISOString() ?? null,
    source: lead.source,
    attribution: { utmSource: lead.utmSource, utmMedium: lead.utmMedium, utmCampaign: lead.utmCampaign, utmContent: lead.utmContent, utmTerm: lead.utmTerm },
  };
}

export type DeliveryRunResult = { enabled: boolean; claimed: number; delivered: number; retrying: number; failed: number };

/** Delivers due leads. Safe to run from cron and right after a submission. */
export async function deliverPendingLeads(options: { limit?: number; leadId?: string } = {}): Promise<DeliveryRunResult> {
  const adapter = getBusinessSystemAdapter();
  const result: DeliveryRunResult = { enabled: Boolean(adapter), claimed: 0, delivered: 0, retrying: 0, failed: 0 };
  if (!adapter) return result;

  const claimed = await claim(options.limit ?? 25, options.leadId);
  result.claimed = claimed.length;

  for (const { lead_id: leadId, attempts } of claimed) {
    try {
      const { upstreamId } = await adapter.deliverLead(await buildPayload(leadId));
      await db.$transaction([
        db.lead.update({ where: { id: leadId }, data: { upstreamId } }),
        db.leadDelivery.update({ where: { leadId }, data: { state: 'delivered', deliveredAt: new Date(), leaseUntil: null, lastError: null } }),
      ]);
      result.delivered++;
    } catch (error) {
      // Store only a safe, customer-data-free summary of the failure.
      const transient = error instanceof DeliveryError ? error.transient : true;
      const safeError = (error instanceof DeliveryError ? error.message : 'Unexpected delivery error').slice(0, 500);
      const giveUp = !transient || attempts >= MAX_DELIVERY_ATTEMPTS;
      await db.leadDelivery.update({
        where: { leadId },
        data: giveUp
          ? { state: 'failed', leaseUntil: null, lastError: safeError }
          : { nextAttemptAt: new Date(Date.now() + nextBackoffMs(attempts)), leaseUntil: null, lastError: safeError },
      });
      if (giveUp) {
        result.failed++;
        // Surfaced to monitoring; the lead itself stays safe in the staff inbox.
        console.error('[lead-delivery] delivery failed permanently', { leadId, attempts, error: safeError });
      } else {
        result.retrying++;
      }
    }
  }
  return result;
}

/** Staff recovery: queue a failed (or stuck) delivery for a fresh retry cycle. */
export async function requeueDelivery(leadId: string) {
  return db.leadDelivery.updateMany({
    where: { leadId, state: { in: ['failed', 'pending'] } },
    data: { state: 'pending', attempts: 0, nextAttemptAt: new Date(), leaseUntil: null },
  });
}

export async function deliveryHealth() {
  const [pending, failed, oldestPending] = await Promise.all([
    db.leadDelivery.count({ where: { state: 'pending' } }),
    db.leadDelivery.count({ where: { state: 'failed' } }),
    db.leadDelivery.findFirst({ where: { state: 'pending' }, orderBy: { nextAttemptAt: 'asc' }, select: { nextAttemptAt: true, attempts: true } }),
  ]);
  return { pending, failed, oldestPending };
}
