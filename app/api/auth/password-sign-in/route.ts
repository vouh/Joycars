import { db } from '@/lib/db';
import { ApiError, assertSameOrigin, clientIp, json, readJson, route } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { passwordSignInSchema } from '@/lib/validation/admin';

/**
 * Staff sign-in with email and password. Accounts without an active staff
 * profile get the same answer as a wrong password, and their session is dropped.
 */
export const POST = route(async req => {
  assertSameOrigin(req);
  await enforceRateLimit('password-sign-in', clientIp(req), 10, 15 * 60);
  const { email, password } = passwordSignInSchema.parse(await readJson(req));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const profile = data.user ? await db.staffProfile.findUnique({ where: { authUserId: data.user.id }, select: { active: true } }) : null;
  if (error || !profile?.active) {
    if (data.user) await supabase.auth.signOut();
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  return json({ ok: true });
});
