import 'server-only';
import { env } from '@/lib/env';

/**
 * Versioned payload sent to the existing business system (ARCHITECTURE.md →
 * Lead capture and integration). Bump `schemaVersion` on breaking changes.
 */
export type LeadPayloadV1 = {
  schemaVersion: 1;
  leadId: string;
  submittedAt: string;
  type: 'enquiry' | 'viewing';
  vehicle: { id: string; externalId: string | null; slug: string; title: string } | null;
  buyer: { name: string; phone: string; email: string | null };
  message: string | null;
  preferredViewingAt: string | null;
  source: 'website';
  attribution: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null };
};

export class DeliveryError extends Error {
  constructor(message: string, public readonly transient: boolean) {
    super(message);
  }
}

export interface BusinessSystemAdapter {
  /** Must be safe to call repeatedly for the same lead (at-least-once delivery). */
  deliverLead(payload: LeadPayloadV1): Promise<{ upstreamId: string | null }>;
}

/**
 * Generic HTTPS webhook adapter. The upstream contract is not yet confirmed;
 * adjust the request/response mapping here once it is. The lead UUID is sent
 * as the Idempotency-Key so the receiver can deduplicate retries.
 */
class HttpBusinessSystemAdapter implements BusinessSystemAdapter {
  constructor(private readonly url: string, private readonly token: string | undefined) {}

  async deliverLead(payload: LeadPayloadV1) {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': payload.leadId,
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'network error';
      throw new DeliveryError(`Business system unreachable (${reason})`, true);
    }
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
      return { upstreamId: body && (typeof body.id === 'string' || typeof body.id === 'number') ? String(body.id).slice(0, 200) : null };
    }
    // Retry server errors and throttling; client errors need human attention.
    const transient = res.status >= 500 || res.status === 408 || res.status === 429;
    throw new DeliveryError(`Business system responded HTTP ${res.status}`, transient);
  }
}

/** Returns null when delivery is disabled or unconfigured: leads stay in the staff inbox. */
export function getBusinessSystemAdapter(): BusinessSystemAdapter | null {
  const { LEAD_DELIVERY_ENABLED, BUSINESS_SYSTEM_LEADS_URL, BUSINESS_SYSTEM_API_TOKEN, NODE_ENV } = env();
  if (!LEAD_DELIVERY_ENABLED || !BUSINESS_SYSTEM_LEADS_URL) return null;
  const url = new URL(BUSINESS_SYSTEM_LEADS_URL);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && NODE_ENV !== 'production')) {
    throw new Error('BUSINESS_SYSTEM_LEADS_URL must use HTTPS');
  }
  return new HttpBusinessSystemAdapter(url.toString(), BUSINESS_SYSTEM_API_TOKEN);
}
