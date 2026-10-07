import { json, route } from '@/lib/http';
import { getPublicLocations } from '@/lib/services/public-inventory';

export const GET = route(async () => json({ items: await getPublicLocations() }, { cache: 'public' }));
