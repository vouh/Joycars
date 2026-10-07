import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { deleteLocation, updateLocation } from '@/lib/services/admin-locations';
import { locationUpdateSchema } from '@/lib/validation/admin';
import { uuid } from '@/lib/validation/common';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff('admin');
  const id = uuid.parse((await params).id);
  return json({ location: await updateLocation(staff, id, locationUpdateSchema.parse(await readJson(req))) });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff('admin');
  await deleteLocation(staff, uuid.parse((await params).id));
  return new Response(null, { status: 204 });
});
