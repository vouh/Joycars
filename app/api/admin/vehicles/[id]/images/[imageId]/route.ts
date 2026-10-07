import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { deleteVehicleImage, updateVehicleImage } from '@/lib/services/images';
import { uuid } from '@/lib/validation/common';
import { imageUpdateSchema } from '@/lib/validation/vehicle';

type Ctx = { params: Promise<{ id: string; imageId: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const { id, imageId } = await params;
  const { altText } = imageUpdateSchema.parse(await readJson(req));
  await updateVehicleImage(staff, uuid.parse(id), uuid.parse(imageId), altText);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const { id, imageId } = await params;
  await deleteVehicleImage(staff, uuid.parse(id), uuid.parse(imageId));
  return new Response(null, { status: 204 });
});
