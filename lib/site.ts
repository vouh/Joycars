/**
 * Public origin for absolute URLs (sitemap, robots). APP_URL wins; on Vercel
 * the production domain is the fallback, so builds never emit localhost links.
 */
export function siteOrigin() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = process.env.APP_URL || (vercelDomain ? `https://${vercelDomain}` : 'http://localhost:3004');
  return origin.replace(/\/$/, '');
}
