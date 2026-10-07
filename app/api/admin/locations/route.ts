import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { createLocation, listLocations } from '@/lib/services/admin-locations';
import { locationCreateSchema } from '@/lib/validation/admin';

export const GET = route(async () => {
  await requireStaff();
  return json({ items: await listLocations() });
});

/** Business details are verified facts, so only administrators maintain them. */
export const POST = route(async req => {
  assertSameOrigin(req);
  const staff = await requireStaff('admin');
  return json({ location: await createLocation(staff, locationCreateSchema.parse(await readJson(req))) }, { status: 201 });
});
