import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  // Indexing rules only; authorization is enforced on the server regardless.
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/auth/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
