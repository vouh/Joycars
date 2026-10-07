import type { MetadataRoute } from 'next';
import { getSitemapVehicles } from '@/lib/services/public-inventory';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/** Public pages only — no filter combinations, admin or API routes. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const pages: MetadataRoute.Sitemap = ['', '/vehicles', '/about', '/contact', '/privacy'].map(path => ({ url: `${base}${path}` }));
  const vehicles = await getSitemapVehicles().catch(() => []);
  return [...pages, ...vehicles.map(v => ({ url: `${base}/vehicles/${v.slug}`, lastModified: v.updatedAt }))];
}
