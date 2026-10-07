/**
 * Safaricom Daraja (M-Pesa) helpers: Lipa na M-Pesa Online / STK Push for a
 * Buy Goods (Till) number. Pure functions are exported for unit tests; the
 * network client lives in createDarajaClient().
 */

const BASE_URLS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
} as const;

export type DarajaConfig = {
  environment: keyof typeof BASE_URLS;
  consumerKey: string;
  consumerSecret: string;
  /** Business short code linked to the passkey (for a Till, the store / head-office number). */
  shortCode: string;
  /** Till number that receives the money (PartyB). */
  tillNumber: string;
  passkey: string;
  callbackUrl: string;
  /** Test-only override of the Daraja API origin (e.g. a local mock). */
  baseUrl?: string;
};

/** `YYYYMMDDHHmmss` in Nairobi time, as Daraja requires. */
export function darajaTimestamp(date = new Date()) {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

export function stkPassword(shortCode: string, passkey: string, timestamp: string) {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
}

/**
 * Converts an E.164 number to the MSISDN Daraja expects (2547XXXXXXXX /
 * 2541XXXXXXXX). Returns null for numbers M-Pesa can't charge.
 */
export function toMpesaMsisdn(e164: string): string | null {
  const digits = e164.replace(/^\+/, '');
  return /^254(7|1)\d{8}$/.test(digits) ? digits : null;
}

/** Daraja STK result codes we treat specially; everything else non-zero is a failure. */
export const RESULT_CODES = {
  SUCCESS: 0,
  CANCELLED_BY_USER: 1032,
  NO_RESPONSE_FROM_USER: 1037,
} as const;

export type StkOutcome = 'paid' | 'cancelled' | 'expired' | 'failed';

export function outcomeForResultCode(code: number): StkOutcome {
  if (code === RESULT_CODES.SUCCESS) return 'paid';
  if (code === RESULT_CODES.CANCELLED_BY_USER) return 'cancelled';
  if (code === RESULT_CODES.NO_RESPONSE_FROM_USER) return 'expired';
  return 'failed';
}

export type ParsedCallback = {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount: number | null;
  receipt: string | null;
  msisdn: string | null;
};

/** Parses the STK Push callback body. Returns null if it isn't one. */
export function parseStkCallback(body: unknown): ParsedCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string' || cb.ResultCode === undefined) return null;
  const items = ((cb.CallbackMetadata as { Item?: { Name: string; Value?: unknown }[] } | undefined)?.Item ?? []);
  const item = (name: string) => items.find(i => i.Name === name)?.Value;
  const amount = Number(item('Amount'));
  const receipt = item('MpesaReceiptNumber');
  const phone = item('PhoneNumber');
  return {
    merchantRequestId: String(cb.MerchantRequestID ?? ''),
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: Number(cb.ResultCode),
    resultDesc: String(cb.ResultDesc ?? '').slice(0, 300),
    amount: Number.isFinite(amount) ? amount : null,
    receipt: typeof receipt === 'string' ? receipt.slice(0, 30) : null,
    msisdn: phone === undefined ? null : String(phone),
  };
}

export class DarajaError extends Error {
  constructor(message: string, public readonly transient: boolean, public readonly errorCode?: string) {
    super(message);
  }
}

/** Daraja answers a query for a still-running transaction with this error code. */
const STILL_PROCESSING = '500.001.1001';

export function createDarajaClient(config: DarajaConfig, fetchImpl: typeof fetch = fetch) {
  const base = config.baseUrl ?? BASE_URLS[config.environment];
  let token: { value: string; expiresAt: number } | null = null;

  async function call(path: string, init: RequestInit) {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, { ...init, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'network error';
      throw new DarajaError(`M-Pesa unreachable (${reason})`, true);
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { res, body };
  }

  async function accessToken() {
    if (token && token.expiresAt > Date.now()) return token.value;
    const basic = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
    const { res, body } = await call('/oauth/v1/generate?grant_type=client_credentials', { headers: { Authorization: `Basic ${basic}` } });
    if (!res.ok || typeof body?.access_token !== 'string') {
      throw new DarajaError(`M-Pesa authentication failed (HTTP ${res.status})`, res.status >= 500);
    }
    const ttlSeconds = Number(body.expires_in) || 3599;
    token = { value: body.access_token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000 };
    return token.value;
  }

  async function authed(path: string, payload: Record<string, unknown>) {
    const { res, body } = await call(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) token = null; // force a fresh token next time
    return { res, body };
  }

  function credentials() {
    const timestamp = darajaTimestamp();
    return { BusinessShortCode: config.shortCode, Password: stkPassword(config.shortCode, config.passkey, timestamp), Timestamp: timestamp };
  }

  return {
    /** Sends the payment prompt to the buyer's phone. */
    async stkPush(input: { msisdn: string; amountKes: number; accountReference: string; description: string }) {
      const { res, body } = await authed('/mpesa/stkpush/v1/processrequest', {
        ...credentials(),
        TransactionType: 'CustomerBuyGoodsOnline',
        Amount: input.amountKes,
        PartyA: input.msisdn,
        PartyB: config.tillNumber,
        PhoneNumber: input.msisdn,
        CallBackURL: config.callbackUrl,
        AccountReference: input.accountReference.slice(0, 12),
        TransactionDesc: input.description.slice(0, 13),
      });
      if (res.ok && body?.ResponseCode === '0' && typeof body.CheckoutRequestID === 'string') {
        return { merchantRequestId: String(body.MerchantRequestID ?? ''), checkoutRequestId: body.CheckoutRequestID };
      }
      const code = typeof body?.errorCode === 'string' ? body.errorCode : String(body?.ResponseCode ?? res.status);
      const message = String(body?.errorMessage ?? body?.ResponseDescription ?? `HTTP ${res.status}`).slice(0, 200);
      throw new DarajaError(`M-Pesa rejected the request: ${message}`, res.status >= 500 || res.status === 429, code);
    },

    /** Asks M-Pesa for the final result. Returns null while the buyer is still deciding. */
    async stkQuery(checkoutRequestId: string): Promise<{ resultCode: number; resultDesc: string } | null> {
      const { res, body } = await authed('/mpesa/stkpushquery/v1/query', { ...credentials(), CheckoutRequestID: checkoutRequestId });
      if (body?.errorCode === STILL_PROCESSING) return null;
      if (res.ok && body?.ResultCode !== undefined) {
        return { resultCode: Number(body.ResultCode), resultDesc: String(body.ResultDesc ?? '').slice(0, 300) };
      }
      throw new DarajaError(`M-Pesa status check failed: ${String(body?.errorMessage ?? `HTTP ${res.status}`).slice(0, 200)}`, res.status >= 500 || res.status === 429, typeof body?.errorCode === 'string' ? body.errorCode : undefined);
    },

    /** Credential check only: fetches an OAuth token, charges nobody. */
    async verifyCredentials() {
      await accessToken();
      return true;
    },
  };
}

export type DarajaClient = ReturnType<typeof createDarajaClient>;
