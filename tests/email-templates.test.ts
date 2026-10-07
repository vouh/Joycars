import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConfirmationEmail, type ConfirmationLead } from '../lib/email-templates';

const lead: ConfirmationLead = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  type: 'viewing',
  name: 'Amina <script>alert(1)</script>',
  phone: '+254712345678',
  email: 'amina@example.com',
  message: 'Is the "service history" available?',
  preferredViewingAt: new Date('2026-10-08T07:00:00Z'),
  vehicle: { make: 'Toyota', model: 'Corolla', year: 2018, availability: 'available' },
};
const showroom = { name: 'Ridgeways showroom', address: 'Kiambu Road, Nairobi', phone: '+254700000000', hours: 'Mon–Sat 9:00–17:00' };

describe('confirmation email', () => {
  it('addresses the buyer and summarizes a viewing request without confirming it', () => {
    const email = buildConfirmationEmail(lead, showroom);
    assert.equal(email.to, 'amina@example.com');
    assert.match(email.subject, /viewing request/);
    assert.match(email.text, /2018 Toyota Corolla/);
    assert.match(email.text, /10:00.*\(Nairobi time\)/);
    assert.match(email.text, /not a confirmed booking/);
    assert.match(email.text, /Reference: A1B2C3D4/);
    assert.match(email.text, /Ridgeways showroom, Kiambu Road, Nairobi/);
  });

  it('escapes customer-supplied text in the HTML version', () => {
    const { html } = buildConfirmationEmail(lead, showroom);
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /Amina &lt;script&gt;/);
    assert.match(html, /&quot;service history&quot;/);
  });

  it('mentions availability for reserved cars and omits missing details', () => {
    const email = buildConfirmationEmail({ ...lead, vehicle: { ...lead.vehicle!, availability: 'reserved' }, message: null }, null);
    assert.match(email.text, /currently reserved/);
    assert.equal(email.text.includes('Your message'), false);
    assert.equal(email.text.includes('Where to find us'), false);
  });

  it('words general enquiries differently', () => {
    const email = buildConfirmationEmail({ ...lead, type: 'enquiry', preferredViewingAt: null, vehicle: null }, showroom);
    assert.match(email.subject, /enquiry/);
    assert.equal(email.text.includes('confirmed booking'), false);
    assert.equal(email.text.includes('Preferred time'), false);
  });
});
