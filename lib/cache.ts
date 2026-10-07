import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';

/** One tag covers all public inventory reads; the inventory is small (~20 cars). */
export const INVENTORY_TAG = 'inventory';
export const LOCATIONS_TAG = 'locations';
/** Fallback lifetime so public pages converge within ~60s even if a revalidation is missed. */
export const PUBLIC_REVALIDATE_SECONDS = 60;

/** Call after any change that affects what buyers can see. */
export function invalidateInventory(...slugs: (string | null | undefined)[]) {
  revalidateTag(INVENTORY_TAG);
  revalidatePath('/');
  revalidatePath('/vehicles');
  revalidatePath('/sitemap.xml');
  for (const slug of slugs) if (slug) revalidatePath(`/vehicles/${slug}`);
}

export function invalidateLocations() {
  revalidateTag(LOCATIONS_TAG);
  revalidateTag(INVENTORY_TAG);
  revalidatePath('/', 'layout');
}
