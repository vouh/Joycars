import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { deleteVehicle, getAdminVehicle, updateVehicle } from '@/lib/services/admin-vehicles';
import { uuid } from '@/lib/validation/common';
import { vehicleUpdateSchema } from '@/lib/validation/vehicle';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  await requireStaff();
  return json({ vehicle: await getAdminVehicle(uuid.parse((await params).id)) });
});

/** Partial edit. Requires the `version` last read; returns 409 on concurrent edits. */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const id = uuid.parse((await params).id);
  const input = vehicleUpdateSchema.parse(await readJson(req));
  return json({ vehicle: await updateVehicle(staff, id, input) });
});

/** Only unpublished vehicles without enquiries can be deleted; otherwise archive. */
export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  await deleteVehicle(staff, uuid.parse((await params).id));
  return new Response(null, { status: 204 });
});
