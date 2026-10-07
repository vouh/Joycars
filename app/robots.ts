import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = siteOrigin();
  // Indexing rules only; authorization is enforced on the server regardless.
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/auth/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
