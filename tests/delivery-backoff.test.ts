import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_DELIVERY_ATTEMPTS, nextBackoffMs } from '../lib/backoff';

describe('delivery backoff', () => {
  const mid = () => 0.5; // no jitter
  it('grows exponentially from 30 seconds', () => {
    assert.equal(nextBackoffMs(1, mid), 30_000);
    assert.equal(nextBackoffMs(2, mid), 60_000);
    assert.equal(nextBackoffMs(3, mid), 120_000);
  });
  it('is capped at 6 hours', () => {
    assert.equal(nextBackoffMs(30, mid), 6 * 60 * 60 * 1000);
  });
  it('applies ±20% jitter', () => {
    assert.equal(nextBackoffMs(1, () => 0), 24_000);
    assert.equal(nextBackoffMs(1, () => 1), 36_000);
  });
  it('gives up after a bounded number of attempts', () => {
    assert.ok(MAX_DELIVERY_ATTEMPTS > 3 && MAX_DELIVERY_ATTEMPTS <= 10);
  });
});
