import { env } from '@/lib/env';
import { assertSameOrigin, clientIp, json, readJson, route } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signInSchema } from '@/lib/validation/admin';

/**
 * Staff sign-in by email link. Never creates accounts (invite-only) and always
 * gives the same answer, so it can't be used to discover staff emails.
 */
export const POST = route(async req => {
  assertSameOrigin(req);
  await enforceRateLimit('sign-in', clientIp(req), 5, 15 * 60);
  const { email } = signInSchema.parse(await readJson(req));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: new URL('/auth/confirm?next=/admin', env().APP_URL).toString() },
  });
  if (error && error.status !== 400 && error.status !== 422) console.error('[auth] sign-in link failed', error.status, error.code);
  return json({ message: 'If this email belongs to an active staff account, a sign-in link is on its way.' });
});
