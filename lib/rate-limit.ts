import 'server-only';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http';

/** Hashes identifiers (IPs, emails) so raw values are never stored. */
export function hashIdentifier(value: string) {
  return createHmac('sha256', env().IP_HASH_SECRET).update(value).digest('base64url').slice(0, 32);
}

/**
 * Database-backed fixed-window limiter. Works across serverless instances
 * without extra infrastructure; adequate for this site's traffic.
 */
export async function enforceRateLimit(scope: string, identifier: string, limit: number, windowSeconds: number) {
  const key = `${scope}:${hashIdentifier(identifier)}`;
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.window_start < now() - make_interval(secs => ${windowSeconds}::float8) THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_start = CASE WHEN rate_limit_buckets.window_start < now() - make_interval(secs => ${windowSeconds}::float8) THEN now() ELSE rate_limit_buckets.window_start END
    RETURNING count`;
  if (Number(row?.count ?? 0) > limit) {
    throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait a few minutes and try again, or call the showroom.');
  }
}

export async function purgeExpiredRateLimits(olderThanSeconds = 86_400) {
  return db.$executeRaw`DELETE FROM rate_limit_buckets WHERE window_start < now() - make_interval(secs => ${olderThanSeconds}::float8)`;
}
