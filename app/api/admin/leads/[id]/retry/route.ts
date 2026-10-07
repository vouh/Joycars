import { after } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, route } from '@/lib/http';
import { retryLeadDelivery } from '@/lib/services/admin-leads';
import { deliverPendingLeads } from '@/lib/services/lead-delivery';
import { uuid } from '@/lib/validation/common';

/** Re-queues a failed delivery to the business system. */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const leadId = uuid.parse((await params).id);
  await retryLeadDelivery(staff, leadId);
  after(() => deliverPendingLeads({ leadId, limit: 1 }).catch(() => undefined));
  return json({ ok: true, message: 'Delivery has been queued again.' }, { status: 202 });
});
