import { assertSameOrigin, json, route } from '@/lib/http';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const POST = route(async req => {
  assertSameOrigin(req);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return json({ ok: true });
});
