import 'server-only';
import { db } from '@/lib/db';
import type { StaffProfile, StaffRole } from '@/lib/generated/prisma/client';
import { ApiError } from '@/lib/http';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** The active staff profile for the current session, or null. */
export async function getStaff(): Promise<StaffProfile | null> {
  const supabase = await createSupabaseServerClient();
  // getUser() verifies the token with Supabase Auth; never trust getSession() alone.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const profile = await db.staffProfile.findUnique({ where: { authUserId: data.user.id } });
  return profile?.active ? profile : null;
}

/** Enforces staff access on the server. Admins satisfy every role check. */
export async function requireStaff(role: StaffRole = 'staff'): Promise<StaffProfile> {
  const staff = await getStaff();
  if (!staff) throw new ApiError(401, 'unauthorized', 'Please sign in with an active staff account.');
  if (role === 'admin' && staff.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access is required.');
  return staff;
}
