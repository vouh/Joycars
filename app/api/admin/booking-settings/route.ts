import { requireStaff } from '@/lib/auth';
import { assertSameOrigin, json, readJson, route } from '@/lib/http';
import { getViewingFee, setViewingFee, viewingFeeSchema } from '@/lib/services/booking-settings';

export const GET = route(async () => { await requireStaff(); return json({ feeKes: await getViewingFee() }); });
export const PATCH = route(async req => {
  assertSameOrigin(req);
  const staff = await requireStaff('admin');
  const { feeKes } = viewingFeeSchema.parse(await readJson(req));
  await setViewingFee(staff, feeKes);
  return json({ feeKes });
});
