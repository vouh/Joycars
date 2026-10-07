// Africa/Nairobi (EAT) is UTC+3 with no daylight saving time.
export const BUSINESS_TIME_ZONE = 'Africa/Nairobi';
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Parses a `YYYY-MM-DDTHH:mm` wall-clock time in Nairobi (as produced by
 * `<input type="datetime-local">`) into a UTC instant. Returns null for
 * malformed or impossible dates such as 2026-02-30.
 */
export function parseNairobiLocal(value: string): Date | null {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return new Date(asUtc - NAIROBI_OFFSET_MS);
}

export function formatNairobi(date: Date): string {
  return new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
