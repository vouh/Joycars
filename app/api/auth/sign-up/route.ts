import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ApiError, assertSameOrigin, clientIp, json, readJson, route } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { adminSignUpSchema } from '@/lib/validation/admin';

/**
 * Self-service administrator sign-up for testing. Only exists while
 * ADMIN_SIGNUP_ENABLED=true; every account it creates is a full admin.
 */
export const POST = route(async req => {
  if (!env().ADMIN_SIGNUP_ENABLED) throw new ApiError(404, 'not_found', 'Not found.');
  assertSameOrigin(req);
  await enforceRateLimit('admin-sign-up', clientIp(req), 5, 60 * 60);
  const { email, password } = adminSignUpSchema.parse(await readJson(req));

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || /already/i.test(error?.message ?? '')) {
      throw new ApiError(409, 'email_exists', 'An account with this email already exists. Sign in instead.');
    }
    if (error?.code === 'weak_password') throw new ApiError(422, 'weak_password', error.message);
    throw new ApiError(502, 'sign_up_failed', 'Could not create the account. Please try again.');
  }

  const authUserId = data.user.id;
  try {
    await db.$transaction(async tx => {
      const profile = await tx.staffProfile.create({ data: { authUserId, email, role: 'admin' } });
      await recordAudit(tx, { actorId: profile.id, action: 'staff.self_registered', entityType: 'staff', entityId: profile.id, changes: { role: 'admin' } });
    });
  } catch (dbError) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw dbError;
  }

  const supabase = await createSupabaseServerClient();
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  return json({ ok: true, signedIn: !signIn.error }, { status: 201 });
});
