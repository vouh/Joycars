import { json, route } from '@/lib/http';
import { getSearchFacets } from '@/lib/services/public-inventory';

/** Makes, price and year ranges from real stock, for building filter controls. */
export const GET = route(async () => json(await getSearchFacets(), { cache: 'public' }));
