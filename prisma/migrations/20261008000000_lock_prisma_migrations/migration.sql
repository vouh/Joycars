-- Prisma's bookkeeping table lives in the public schema, which Supabase exposes
-- through its Data API. Lock it like every other table (Prisma, as owner, is unaffected).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "_prisma_migrations" FROM anon, authenticated;
