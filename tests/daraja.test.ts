import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDarajaClient, darajaTimestamp, outcomeForResultCode, parseStkCallback, stkPassword, toMpesaMsisdn } from '../lib/integrations/daraja';

describe('Daraja helpers', () => {
  it('formats timestamps in Nairobi time', () => {
    assert.equal(darajaTimestamp(new Date('2026-10-08T21:05:09Z')), '20261009000509');
  });
  it('builds the STK password as base64(shortcode + passkey + timestamp)', () => {
    assert.equal(stkPassword('174379', 'key', '20261008120000'), Buffer.from('174379key20261008120000').toString('base64'));
  });
  it('accepts only Kenyan mobile numbers M-Pesa can charge', () => {
    assert.equal(toMpesaMsisdn('+254712345678'), '254712345678');
    assert.equal(toMpesaMsisdn('+254110345678'), '254110345678');
    assert.equal(toMpesaMsisdn('+254202345678'), null); // landline
    assert.equal(toMpesaMsisdn('+442079460958'), null);
  });
  it('maps result codes', () => {
    assert.equal(outcomeForResultCode(0), 'paid');
    assert.equal(outcomeForResultCode(1032), 'cancelled');
    assert.equal(outcomeForResultCode(1037), 'expired');
    assert.equal(outcomeForResultCode(1), 'failed');
  });
});

describe('STK callback parsing', () => {
  it('reads a successful payment', () => {
    const cb = parseStkCallback({
      Body: { stkCallback: {
        MerchantRequestID: 'm-1', CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: { Item: [{ Name: 'Amount', Value: 500 }, { Name: 'MpesaReceiptNumber', Value: 'TJ81ABCDEF' }, { Name: 'Balance' }, { Name: 'TransactionDate', Value: 20261008120501 }, { Name: 'PhoneNumber', Value: 254712345678 }] },
      } },
    });
    assert.deepEqual(cb, { merchantRequestId: 'm-1', checkoutRequestId: 'ws_CO_1', resultCode: 0, resultDesc: 'The service request is processed successfully.', amount: 500, receipt: 'TJ81ABCDEF', msisdn: '254712345678' });
  });
  it('reads a cancellation without metadata', () => {
    const cb = parseStkCallback({ Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'ws_CO_2', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } });
    assert.equal(cb?.resultCode, 1032);
    assert.equal(cb?.amount, null);
    assert.equal(cb?.receipt, null);
  });
  it('rejects non-callback bodies', () => {
    assert.equal(parseStkCallback({ hello: 'world' }), null);
    assert.equal(parseStkCallback(null), null);
  });
});

describe('Daraja client', () => {
  const config = { environment: 'sandbox' as const, consumerKey: 'k', consumerSecret: 's', shortCode: '123456', tillNumber: '654321', passkey: 'pk', callbackUrl: 'https://example.com/cb' };

  it('sends a Buy Goods STK push to the till and caches the token', async () => {
    const calls: { url: string; body?: Record<string, unknown> }[] = [];
    const fake: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/oauth/')) return Response.json({ access_token: 'tok', expires_in: '3599' });
      return Response.json({ MerchantRequestID: 'm', CheckoutRequestID: 'ws_CO_X', ResponseCode: '0', ResponseDescription: 'Success' });
    };
    const client = createDarajaClient(config, fake);
    const r = await client.stkPush({ msisdn: '254712345678', amountKes: 500, accountReference: 'JC1234567890ABC', description: 'Viewing fee for car' });
    await client.stkPush({ msisdn: '254712345678', amountKes: 500, accountReference: 'X', description: 'Y' });
    assert.equal(r.checkoutRequestId, 'ws_CO_X');
    assert.equal(calls.filter(c => c.url.includes('/oauth/')).length, 1);
    const push = calls[1].body!;
    assert.equal(push.TransactionType, 'CustomerBuyGoodsOnline');
    assert.equal(push.BusinessShortCode, '123456');
    assert.equal(push.PartyB, '654321');
    assert.equal(push.PartyA, '254712345678');
    assert.equal(push.AccountReference, 'JC1234567890');
    assert.equal(String(push.TransactionDesc).length <= 13, true);
  });

  it('reports a still-processing query as null and surfaces rejections', async () => {
    const fake: typeof fetch = async input => {
      const url = String(input);
      if (url.includes('/oauth/')) return Response.json({ access_token: 'tok', expires_in: '3599' });
      if (url.includes('stkpushquery')) return Response.json({ errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' }, { status: 500 });
      return Response.json({ errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid PhoneNumber' }, { status: 400 });
    };
    const client = createDarajaClient(config, fake);
    assert.equal(await client.stkQuery('ws_CO_X'), null);
    await assert.rejects(client.stkPush({ msisdn: '254712345678', amountKes: 1, accountReference: 'a', description: 'b' }), /Invalid PhoneNumber/);
  });
});
