import 'server-only';
import { z } from 'zod';

const optionalUrl = z.url().optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_IMAGES_BUCKET: z.string().min(1).default('vehicle-images'),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
  IP_HASH_SECRET: z.string().min(32, 'IP_HASH_SECRET must be at least 32 characters'),
  // Business-system adapter. Delivery stays off unless explicitly enabled, so
  // preview environments can never send test leads to production.
  LEAD_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  BUSINESS_SYSTEM_LEADS_URL: optionalUrl,
  BUSINESS_SYSTEM_API_TOKEN: z.string().optional(),
  // Lets anyone create an administrator account from /admin. Testing only:
  // keep it off wherever the site is public.
  ADMIN_SIGNUP_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  // Customer confirmation emails (Resend). Sending is skipped until both are set.
  // RESEND_FROM_EMAIL / RESEND_CONTACT_TO_EMAIL are accepted as alternative names.
  RESEND_API_KEY: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
  EMAIL_FROM: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
  EMAIL_REPLY_TO: z.preprocess(v => (v === '' ? undefined : v), z.email().optional()),
  // M-Pesa (Daraja STK Push) viewing fee. Payments are off until every
  // credential is set; viewing requests then work without a fee.
  MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  /** Short code linked to the passkey (for a Till: the store / head-office number). */
  MPESA_SHORTCODE: z.string().regex(/^\d{5,7}$/, 'MPESA_SHORTCODE must be 5–7 digits').optional(),
  /** Till (Buy Goods) number that receives the money; defaults to MPESA_SHORTCODE. */
  MPESA_TILL_NUMBER: z.string().regex(/^\d{5,7}$/, 'MPESA_TILL_NUMBER must be 5–7 digits').optional(),
  MPESA_PASSKEY: z.string().optional(),
  /** Secret path segment in the callback URL (Daraja callbacks are unsigned). */
  MPESA_CALLBACK_SECRET: z.string().min(32, 'MPESA_CALLBACK_SECRET must be at least 32 characters').optional(),
  /** Public HTTPS origin Safaricom calls back; defaults to APP_URL (use a tunnel URL locally). */
  MPESA_CALLBACK_BASE_URL: optionalUrl,
  /** Development/testing only: point the Daraja client at a mock server. Ignored in production. */
  MPESA_API_BASE_URL: optionalUrl,
  VIEWING_FEE_KES: z.coerce.number().int().min(1).max(150_000).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment, parsed lazily so builds don't need secrets. */
export function env(): Env {
  if (cached) return cached;
  // Blank entries in env files (`KEY=`) count as unset so defaults apply.
  const values: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  values.EMAIL_FROM ??= values.RESEND_FROM_EMAIL;
  values.EMAIL_REPLY_TO ??= values.RESEND_CONTACT_TO_EMAIL;
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
