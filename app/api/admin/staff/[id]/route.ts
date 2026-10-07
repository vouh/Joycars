import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { updateStaff } from '@/lib/services/admin-staff';
import { staffUpdateSchema } from '@/lib/validation/admin';
import { uuid } from '@/lib/validation/common';

/** Change role or deactivate. Deactivation takes effect on the very next request. */
export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireStaff('admin');
  const id = uuid.parse((await params).id);
  return json({ staff: await updateStaff(admin, id, staffUpdateSchema.parse(await readJson(req))) });
});
