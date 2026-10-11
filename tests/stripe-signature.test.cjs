const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const handler = require('../functions/stripe-webhook').handler;
const stripe = new Stripe('sk_test_signature_only');
process.env.STRIPE_SECRET_KEY = 'sk_test_signature_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_signature_only';
function signedEvent(base64 = false) {
  const body = JSON.stringify({ id: 'evt_test_signed', type: 'unhandled.test_event', data: { object: {} } });
  return { httpMethod: 'POST', headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET }) }, body: base64 ? Buffer.from(body).toString('base64') : body, isBase64Encoded: base64 };
}
test('real Stripe SDK accepts valid signature and base64 payload', async () => {
  assert.equal((await handler(signedEvent())).statusCode, 200);
  assert.equal((await handler(signedEvent(true))).statusCode, 200);
});
test('real Stripe SDK rejects forged signature and altered body', async () => {
  const forged = signedEvent(); forged.headers['stripe-signature'] = 't=1,v1=forged';
  assert.equal((await handler(forged)).statusCode, 400);
  const altered = signedEvent(); altered.body += ' ';
  assert.equal((await handler(altered)).statusCode, 400);
});
