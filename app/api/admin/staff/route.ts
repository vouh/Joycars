import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { inviteStaff, listStaff } from '@/lib/services/admin-staff';
import { staffInviteSchema } from '@/lib/validation/admin';

/** Administrators manage access. */
export const GET = route(async () => {
  await requireStaff('admin');
  return json({ items: await listStaff() });
});

export const POST = route(async req => {
  assertSameOrigin(req);
  const admin = await requireStaff('admin');
  return json({ staff: await inviteStaff(admin, staffInviteSchema.parse(await readJson(req))) }, { status: 201 });
});
