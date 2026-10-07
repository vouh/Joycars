import { requireStaff } from '@/lib/auth';
import { ApiError, assertSameOrigin, json, readJson, route } from '@/lib/http';
import { addVehicleImage, MAX_UPLOAD_BYTES, reorderVehicleImages } from '@/lib/services/images';
import { uuid } from '@/lib/validation/common';
import { imageReorderSchema, imageUpdateSchema } from '@/lib/validation/vehicle';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** multipart/form-data with `file` and `altText`. The photo is decoded, checked and re-encoded server-side. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const vehicleId = uuid.parse((await params).id);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new ApiError(413, 'image_too_large', 'Photos must be 15 MB or smaller.');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'invalid_form', 'Send the photo as multipart form data.');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError(422, 'validation_failed', 'Choose a photo to upload.', { fields: { file: 'Choose a photo to upload.' } });
  }
  const { altText } = imageUpdateSchema.parse({ altText: form.get('altText') });
  return json({ image: await addVehicleImage(staff, vehicleId, file, altText) }, { status: 201 });
});

/** Body `{ imageIds: [...] }` — the complete new order; the first becomes the cover photo. */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const staff = await requireStaff();
  const vehicleId = uuid.parse((await params).id);
  const { imageIds } = imageReorderSchema.parse(await readJson(req));
  await reorderVehicleImages(staff, vehicleId, imageIds);
  return json({ ok: true });
});
