import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseNairobiLocal } from '../lib/time';
import { leadSubmissionSchema, phoneSchema } from '../lib/validation/lead';
import { publicSearchSchema, vehicleCreateSchema, vehicleUpdateSchema } from '../lib/validation/vehicle';

// 2026-10-07 09:00 in Nairobi (06:00 UTC).
const NOW = new Date('2026-10-07T06:00:00Z');
const schema = leadSubmissionSchema(() => NOW);
const base = { idempotencyKey: randomUUID(), name: 'Amina Wanjiru', phone: '0712 345 678' };

describe('Nairobi time', () => {
  it('converts wall-clock time to UTC (UTC+3, no DST)', () => {
    assert.equal(parseNairobiLocal('2026-10-08T14:30')?.toISOString(), '2026-10-08T11:30:00.000Z');
  });
  it('rejects impossible or malformed dates', () => {
    assert.equal(parseNairobiLocal('2026-02-30T10:00'), null);
    assert.equal(parseNairobiLocal('2026-10-08 14:30'), null);
    assert.equal(parseNairobiLocal('2026-10-08T24:00'), null);
  });
});

describe('phone normalization', () => {
  it('accepts local and international Kenyan formats', () => {
    assert.equal(phoneSchema.parse('0712 345 678'), '+254712345678');
    assert.equal(phoneSchema.parse('+254 712 345 678'), '+254712345678');
  });
  it('accepts foreign numbers in international format', () => {
    assert.equal(phoneSchema.parse('+44 20 7946 0958'), '+442079460958');
  });
  it('rejects junk', () => {
    assert.equal(phoneSchema.safeParse('12345').success, false);
    assert.equal(phoneSchema.safeParse('call me').success, false);
  });
});

describe('lead submission', () => {
  it('accepts a minimal enquiry and normalizes fields', () => {
    const lead = schema.parse({ ...base, type: 'enquiry', email: '', message: '  Is it still available? ' });
    assert.equal(lead.phone, '+254712345678');
    assert.equal(lead.email, undefined);
    assert.equal(lead.message, 'Is it still available?');
    assert.equal(lead.isBot, false);
  });

  const viewing = { ...base, type: 'viewing', email: 'amina@example.com' };

  it('requires a preferred time for viewings', () => {
    const result = schema.safeParse({ ...viewing, preferredViewingTime: undefined });
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0].path, ['preferredViewingTime']);
  });

  it('requires an email for viewings so a confirmation can be sent', () => {
    const result = schema.safeParse({ ...viewing, email: '', preferredViewingTime: '2026-10-08T10:00' });
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues.map(i => i.path), [['email']]);
  });

  it('rejects viewing times in the past (Nairobi time)', () => {
    // 08:00 Nairobi is before "now" (09:00 Nairobi), even though it's a later UTC hour than 06:00.
    assert.equal(schema.safeParse({ ...viewing, preferredViewingTime: '2026-10-07T08:00' }).success, false);
  });

  it('accepts a future viewing and stores it as UTC', () => {
    const lead = schema.parse({ ...viewing, preferredViewingTime: '2026-10-08T10:00' });
    assert.equal(lead.preferredViewingAt?.toISOString(), '2026-10-08T07:00:00.000Z');
    assert.equal(lead.email, 'amina@example.com');
  });

  it('rejects viewings too far ahead', () => {
    assert.equal(schema.safeParse({ ...viewing, preferredViewingTime: '2027-06-01T10:00' }).success, false);
  });

  it('flags honeypot submissions as bots', () => {
    assert.equal(schema.parse({ ...base, type: 'enquiry', website: 'http://spam.example' }).isBot, true);
  });

  it('enforces length limits and a valid idempotency key', () => {
    assert.equal(schema.safeParse({ ...base, type: 'enquiry', message: 'x'.repeat(2001) }).success, false);
    assert.equal(schema.safeParse({ ...base, idempotencyKey: 'abc', type: 'enquiry' }).success, false);
  });
});

describe('public search params', () => {
  it('applies defaults and coerces numbers', () => {
    const s = publicSearchSchema.parse({ minPrice: '1000000', page: '2' });
    assert.equal(s.minPrice, 1_000_000);
    assert.equal(s.page, 2);
    assert.equal(s.pageSize, 12);
    assert.equal(s.sort, 'newest');
  });
  it('ignores empty params and rejects unknown enum values', () => {
    assert.equal(publicSearchSchema.parse({ fuel: '' }).fuel, undefined);
    assert.equal(publicSearchSchema.safeParse({ fuel: 'steam' }).success, false);
    assert.equal(publicSearchSchema.safeParse({ sort: 'random' }).success, false);
  });
  it('bounds page size and rejects inverted ranges', () => {
    assert.equal(publicSearchSchema.safeParse({ pageSize: '1000' }).success, false);
    assert.equal(publicSearchSchema.safeParse({ minPrice: '5', maxPrice: '1' }).success, false);
  });
});

describe('vehicle input', () => {
  it('allows drafts with only make and model', () => {
    const v = vehicleCreateSchema.parse({ make: 'Toyota', model: 'Corolla' });
    assert.equal(v.make, 'Toyota');
  });
  it('rejects negative prices and float prices', () => {
    assert.equal(vehicleCreateSchema.safeParse({ make: 'Toyota', model: 'Corolla', priceKes: -1 }).success, false);
    assert.equal(vehicleCreateSchema.safeParse({ make: 'Toyota', model: 'Corolla', priceKes: 10.5 }).success, false);
  });
  it('requires a version on update', () => {
    assert.equal(vehicleUpdateSchema.safeParse({ priceKes: 100 }).success, false);
    assert.equal(vehicleUpdateSchema.safeParse({ version: 1 }).success, false);
    assert.equal(vehicleUpdateSchema.safeParse({ version: 1, priceKes: 100 }).success, true);
  });
  it('validates slugs', () => {
    assert.equal(vehicleCreateSchema.safeParse({ make: 'A', model: 'B', slug: 'Bad Slug!' }).success, false);
    assert.equal(vehicleCreateSchema.parse({ make: 'A', model: 'B', slug: '2018-toyota-corolla' }).slug, '2018-toyota-corolla');
  });
});
