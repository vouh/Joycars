import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, parseQuery, readJson, route } from '@/lib/http';
import { createVehicle, listAdminVehicles } from '@/lib/services/admin-vehicles';
import { adminVehicleListSchema, vehicleCreateSchema } from '@/lib/validation/vehicle';

export const GET = route(async req => {
  await requireStaff();
  return json(await listAdminVehicles(parseQuery(req, adminVehicleListSchema)));
});

/** New listings always start as drafts. */
export const POST = route(async req => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const input = vehicleCreateSchema.parse(await readJson(req));
  return json({ vehicle: await createVehicle(staff, input) }, { status: 201 });
});
