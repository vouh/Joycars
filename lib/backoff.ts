export const MAX_DELIVERY_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

/** Bounded exponential backoff with ±20% jitter: ~30s, 1m, 2m … capped at 6h. */
export function nextBackoffMs(attempt: number, random = Math.random) {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp * (0.8 + random() * 0.4));
}
