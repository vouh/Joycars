import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/** Cookie-bound client acting as the signed-in user (staff auth only). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}

let adminClient: ReturnType<typeof createClient> | undefined;

/** Privileged client for Storage and staff invitations. Server-side only. */
export function supabaseAdmin() {
  if (adminClient) return adminClient;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  adminClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export function publicImageUrl(storageKey: string) {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_IMAGES_BUCKET } = env();
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SUPABASE_IMAGES_BUCKET}/${storageKey}`;
}
