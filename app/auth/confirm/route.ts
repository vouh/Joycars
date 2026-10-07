import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Completes staff invitation and sign-in links, then returns to the admin area. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const next = searchParams.get('next');
  // Only same-site relative paths: prevents open redirects.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  const supabase = await createSupabaseServerClient();

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('missing token') };

  const url = new URL(error ? '/admin?auth_error=1' : target, req.url);
  return NextResponse.redirect(url);
}
