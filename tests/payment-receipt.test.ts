import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildPaymentReceiptEmail } from '../lib/email-templates';

it('payment receipt states the paid fee, escapes content and does not confirm the appointment', () => {
  const receipt = buildPaymentReceiptEmail({name:'Buyer <script>',email:'buyer@example.com',reference:'ABC12345',amountKes:5,receipt:'MP1234',vehicle:'Toyota <Corolla>'});
  assert.match(receipt.text,/KES 5/);
  assert.match(receipt.text,/MP1234/);
  assert.match(receipt.text,/does not confirm the appointment/);
  assert.match(receipt.html,/Buyer &lt;script&gt;/);
  assert.doesNotMatch(receipt.html,/<script>/);
  assert.equal(receipt.to,'buyer@example.com');
});
