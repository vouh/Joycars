import { json, parseQuery, route } from '@/lib/http';
import { searchVehicles } from '@/lib/services/public-inventory';
import { publicSearchSchema } from '@/lib/validation/vehicle';

/** Public inventory search: available and reserved published vehicles only. */
export const GET = route(async req => {
  const search = parseQuery(req, publicSearchSchema);
  return json(await searchVehicles(search), { cache: 'public' });
});
