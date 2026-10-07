import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  // Cache in every environment: one client per server instance, and a single
  // instance across dev hot reloads.
  globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return globalForPrisma.prisma;
}

/** Lazily-connected Prisma client, so builds don't require DATABASE_URL. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
