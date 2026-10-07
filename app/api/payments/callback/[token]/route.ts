import { NextResponse, type NextRequest } from 'next/server';
import { callbackTokenValid, handleStkCallback } from '@/lib/services/payments';

export const dynamic = 'force-dynamic';

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' };

/**
 * Safaricom STK Push result callback. Daraja doesn't sign callbacks, so the URL
 * carries a secret token, and the CheckoutRequestID must match a request we
 * issued. Always acknowledge so Safaricom doesn't retry indefinitely; the
 * status query is the safety net if processing fails.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!callbackTokenValid((await params).token)) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Rejected' }, { status: 404 });
  try {
    const body = await req.json();
    const result = await handleStkCallback(body);
    if (!result.handled) console.warn('[payments] callback ignored', result.reason);
  } catch (error) {
    console.error('[payments] callback processing failed', error instanceof Error ? error.message : 'unknown');
  }
  return NextResponse.json(ACCEPTED);
}
