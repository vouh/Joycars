/**
 * One-off environment setup, safe to re-run:
 *   1. creates the public Storage bucket for normalized vehicle photos;
 *   2. sets up the first administrator from BOOTSTRAP_ADMIN_EMAIL: with
 *      BOOTSTRAP_ADMIN_PASSWORD it creates the account (or resets its password)
 *      for email + password sign-in; without it, it sends an invitation link.
 *
 * Usage: BOOTSTRAP_ADMIN_EMAIL=owner@example.com BOOTSTRAP_ADMIN_PASSWORD='long-secret' npm run bootstrap
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '../lib/generated/prisma/client';

config({ path: ['.env.local', '.env'], quiet: true });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SECRET_KEY'), { auth: { persistSession: false } });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }) });
  const bucket = process.env.SUPABASE_IMAGES_BUCKET || 'vehicle-images';

  const { data: existing } = await supabase.storage.getBucket(bucket);
  if (existing) {
    console.log(`Bucket "${bucket}" already exists.`);
  } else {
    // Only server-normalized WebP derivatives are stored here, under generated keys.
    const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: '10MB', allowedMimeTypes: ['image/webp'] });
    if (error) throw new Error(`Could not create bucket: ${error.message}`);
    console.log(`Created public bucket "${bucket}".`);
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (password !== undefined && password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');

  async function findAuthUserId(address: string) {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`Could not list users: ${error.message}`);
      const match = data.users.find(u => u.email?.toLowerCase() === address);
      if (match) return match.id;
      if (data.users.length < 200) break;
    }
    return undefined;
  }

  if (!email) {
    console.log('BOOTSTRAP_ADMIN_EMAIL not set; skipping administrator setup.');
  } else {
    let authUserId: string | undefined;
    if (password) {
      // Email + password sign-in on /admin; no invitation email needed.
      const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
      authUserId = created.data.user?.id;
      if (authUserId) {
        console.log(`Created ${email} with the supplied password.`);
      } else {
        authUserId = await findAuthUserId(email);
        if (!authUserId) throw new Error(`Could not create or find ${email}: ${created.error?.message}`);
        const { error } = await supabase.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
        if (error) throw new Error(`Could not set the password for ${email}: ${error.message}`);
        console.log(`${email} already had an auth account; password updated.`);
      }
    } else {
      const appUrl = required('APP_URL');
      const invite = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: new URL('/auth/confirm?next=/admin', appUrl).toString() });
      if (invite.data.user) {
        authUserId = invite.data.user.id;
        console.log(`Invitation sent to ${email}.`);
      } else {
        authUserId = await findAuthUserId(email);
        if (!authUserId) throw new Error(`Could not invite or find ${email}: ${invite.error?.message}`);
        console.log(`${email} already has an auth account; linking it.`);
      }
    }
    await db.staffProfile.upsert({
      where: { authUserId },
      create: { authUserId, email, role: 'admin' },
      update: { role: 'admin', active: true, email },
    });
    console.log(`${email} is an active administrator.`);
  }
  await db.$disconnect();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
