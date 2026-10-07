import 'server-only';
import type { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { StaffProfile } from '@/lib/generated/prisma/client';
import { ApiError, notFound } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { staffInviteSchema, staffUpdateSchema } from '@/lib/validation/admin';

export async function listStaff() {
  return db.staffProfile.findMany({ orderBy: [{ active: 'desc' }, { email: 'asc' }] });
}

/** Invite-only access: Supabase sends the invitation; there is no public sign-up. */
export async function inviteStaff(admin: StaffProfile, input: z.infer<typeof staffInviteSchema>) {
  const existing = await db.staffProfile.findFirst({ where: { email: input.email } });
  if (existing) throw new ApiError(409, 'already_staff', 'This person already has a staff account. Reactivate it instead.');

  const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(input.email, {
    redirectTo: new URL('/auth/confirm?next=/admin', env().APP_URL).toString(),
  });
  if (error || !data.user) {
    console.error('[staff] invite failed', error?.status, error?.code);
    throw new ApiError(error?.status === 422 ? 409 : 502, 'invite_failed', error?.status === 422 ? 'An account with this email already exists in authentication. Ask an administrator to link it.' : 'The invitation could not be sent. Please try again.');
  }

  return db.$transaction(async tx => {
    const profile = await tx.staffProfile.create({ data: { authUserId: data.user.id, email: input.email, role: input.role } });
    await recordAudit(tx, { actorId: admin.id, action: 'staff.invited', entityType: 'staff', entityId: profile.id, changes: { role: input.role } });
    return profile;
  });
}

export async function updateStaff(admin: StaffProfile, id: string, input: z.infer<typeof staffUpdateSchema>) {
  return db.$transaction(async tx => {
    const target = await tx.staffProfile.findUnique({ where: { id } });
    if (!target) throw notFound('Staff member');
    const losesAdmin = target.role === 'admin' && target.active && (input.role === 'staff' || input.active === false);
    if (losesAdmin) {
      const admins = await tx.staffProfile.count({ where: { role: 'admin', active: true } });
      if (admins <= 1) throw new ApiError(409, 'last_admin', 'At least one active administrator is required.');
    }
    if (target.id === admin.id && input.active === false) throw new ApiError(409, 'self_deactivate', 'You cannot deactivate your own account.');
    const profile = await tx.staffProfile.update({ where: { id }, data: input });
    await recordAudit(tx, { actorId: admin.id, action: 'staff.updated', entityType: 'staff', entityId: id, changes: input });
    return profile;
  });
}
