import { requireStaff } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { getLead } from '@/lib/services/admin-leads';
import { uuid } from '@/lib/validation/common';

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  return json({ lead: await getLead(uuid.parse((await params).id)) });
});
