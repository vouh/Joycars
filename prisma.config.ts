import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same precedence as Next.js: .env.local overrides .env.
config({ path: ['.env.local', '.env'], quiet: true });

// Migrations use the direct (session) connection; the app runtime uses the
// pooled DATABASE_URL through the pg driver adapter in lib/db.ts.
// DIRECT_URL may be absent for commands that don't touch the database (generate).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
});
