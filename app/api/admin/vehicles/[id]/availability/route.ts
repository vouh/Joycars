import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { changeAvailability } from '@/lib/services/admin-vehicles';
import { uuid } from '@/lib/validation/common';
import { availabilityChangeSchema } from '@/lib/validation/vehicle';

/** available / reserved / sold. Marking sold needs `confirm: true`; un-selling needs a `reason`. */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const id = uuid.parse((await params).id);
  return json({ vehicle: await changeAvailability(staff, id, availabilityChangeSchema.parse(await readJson(req))) });
});
