import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { changePublication } from '@/lib/services/admin-vehicles';
import { uuid } from '@/lib/validation/common';
import { publicationChangeSchema } from '@/lib/validation/vehicle';

/** Publish, unpublish (back to draft) or archive. Publishing checks listing completeness. */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const id = uuid.parse((await params).id);
  return json({ vehicle: await changePublication(staff, id, publicationChangeSchema.parse(await readJson(req))) });
});
