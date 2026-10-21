const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
class MemoryStore {
  constructor() { this.data = new Map(); this.sequence = 0; this.failWrites = false; }
  async get(key) { return this.data.has(key) ? structuredClone(this.data.get(key).data) : null; }
  async getWithMetadata(key) { return this.data.has(key) ? structuredClone(this.data.get(key)) : null; }
  async setJSON(key, data, options = {}) {
    if (this.failWrites) throw new Error('Storage down');
    const existing = this.data.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.sequence); this.data.set(key, { data: structuredClone(data), etag }); return { modified: true, etag };
  }
  async delete(key) { this.data.delete(key); }
  async list({ prefix }) { return { blobs: [...this.data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
}
let db = new MemoryStore(), checkoutPayload, receipt;
class FakeStripe {
  constructor() {
    this.checkout = { sessions: { create: async payload => { checkoutPayload = payload; return { id: 'cs_test_verified', url: 'https://checkout.stripe.com/test' }; }, retrieve: async () => receipt } };
    this.webhooks = { constructEvent: body => JSON.parse(Buffer.isBuffer(body) ? body.toString() : body) };
  }
}
const originalLoad = Module._load;
Module._load = function (name, ...args) { if (name === '@netlify/blobs') return { getStore: () => db, connectLambda() {} }; if (name === 'stripe') return FakeStripe; return originalLoad.call(this, name, ...args); };
const r = require('../lib/runtime');
const handlers = Object.fromEntries(['auth', 'site-state', 'users', 'reservations', 'create-checkout', 'checkout-status', 'stripe-webhook', 'agent-run', 'meta-webhook'].map(name => [name, require('../functions/' + name).handler]));
const bookings = require('../lib/bookings');
Module._load = originalLoad;
process.env.URL = 'https://barbarella.netlify.app';
process.env.BARBARELLA_SESSION_SECRET = 'test-only-secret-at-least-thirty-two-characters';
process.env.BARBARELLA_ADMIN_PASSWORD = 'test-only-password-12345';
function event(method, data, cookie, query) { return { httpMethod: method, headers: { origin: process.env.URL, cookie, 'x-nf-client-connection-ip': 'test' }, body: JSON.stringify(data || {}), queryStringParameters: query }; }
async function login(login = 'admin', password = process.env.BARBARELLA_ADMIN_PASSWORD) { const result = await handlers.auth(event('POST', { login, password })); assert.equal(result.statusCode, 200); return result.headers['Set-Cookie'].split(';')[0]; }
function reset() { db = new MemoryStore(); }
const uuid = () => crypto.randomUUID();
const input = { requestId: uuid(), name: 'Amine Test', email: 'amine@example.test', tel: '+33612345678', soin: 'Massage Iris', date: '2099-10-12', time: '15:00', expert: '', duration: '30', amount: 1, success_url: 'https://attacker.test' };

test('private data encrypted and tampering rejected', async () => {
  reset(); await r.privateSet(db, 'private/test', { email: input.email });
  assert.ok(!JSON.stringify(await db.get('private/test')).includes(input.email));
  assert.deepEqual(await r.privateGet(db, 'private/test'), { email: input.email });
  const sealed = r.seal({ email: input.email }); sealed.tag = Buffer.alloc(16).toString('base64'); assert.throws(() => r.unseal(sealed));
});
test('public catalog available; private clients and users never exposed', async () => {
  reset(); await r.privateSet(db, 'private/clients', [{ email: input.email }]);
  const result = await handlers['site-state'](event('GET')); const data = JSON.parse(result.body);
  assert.equal(result.statusCode, 200); assert.ok(data.state.services.length > 20); assert.equal(data.state.clients, undefined); assert.equal(data.users, undefined); assert.ok(!result.body.includes(input.email));
});
test('legacy credentials and unauthenticated admin writes rejected', async () => {
  reset(); const old = await handlers.auth(event('POST', { login: 'admin', password: 'admin2026' })); assert.equal(old.statusCode, 401);
  assert.equal((await handlers['site-state'](event('PUT', { field: 'promo', value: null, version: null }))).statusCode, 401);
  assert.equal((await handlers['agent-run'](event('POST', {}))).statusCode, 401);
});
test('secure cookie, cross-origin rejection and logout revocation', async () => {
  reset(); const result = await handlers.auth(event('POST', { login: 'admin', password: process.env.BARBARELLA_ADMIN_PASSWORD }));
  assert.match(result.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
  const cookie = result.headers['Set-Cookie'].split(';')[0];
  const foreign = event('PUT', { field: 'promo', value: null, version: null }, cookie); foreign.headers.origin = 'https://attacker.test';
  assert.equal((await handlers['site-state'](foreign)).statusCode, 403);
  assert.equal((await handlers.auth(event('DELETE', {}, cookie))).statusCode, 200);
  assert.equal((await handlers.auth(event('GET', {}, cookie))).statusCode, 401);
});
test('password rotation invalidates administrator sessions', async () => {
  reset(); const cookie = await login(); const original = process.env.BARBARELLA_ADMIN_PASSWORD;
  process.env.BARBARELLA_ADMIN_PASSWORD = 'changed-password-12345';
  assert.equal((await handlers.auth(event('GET', {}, cookie))).statusCode, 401); process.env.BARBARELLA_ADMIN_PASSWORD = original;
});
test('roles enforced server-side, password hashes hidden and stale save rejected', async () => {
  reset(); const admin = await login();
  const created = await handlers.users(event('POST', { login: 'employee', name: 'Test', role: 'employee', password: 'employee-test-password' }, admin)); assert.equal(created.statusCode, 200);
  const employee = await login('employee', 'employee-test-password');
  assert.equal((await handlers['site-state'](event('PUT', { field: 'promo', value: null, version: null }, employee))).statusCode, 403);
  assert.equal((await handlers.users(event('POST', {}, employee))).statusCode, 403);
  const saved = await handlers['site-state'](event('PUT', { field: 'promo', value: { title: 'Offre', desc: 'Texte' }, version: null }, admin)); assert.equal(saved.statusCode, 200);
  assert.equal((await handlers['site-state'](event('PUT', { field: 'promo', value: null, version: null }, admin))).statusCode, 409);
  const pro = await handlers['site-state'](event('GET', {}, admin, { scope: 'pro' })); assert.ok(!pro.body.includes('employee-test-password')); assert.ok(!pro.body.includes('hash'));
});
test('malicious HTML, attribute URLs and executable identifiers rejected', async () => {
  reset(); const admin = await login();
  for (const [field, value] of [['news', [{ id: 1, title: 'Test', text: '<img src=x onerror=alert(1)>' }]], ['team', [{ id: '1);alert(1);//', name: 'Test', photo: 'https://example.test/photo' }]], ['team', [{ id: 1, name: 'Test', photo: 'javascript:alert(1)' }]]]) {
    assert.equal((await handlers['site-state'](event('PUT', { field, value, version: null }, admin))).statusCode, 400);
  }
});
test('onsite booking durable with date, time and expert; no paid status invented', async () => {
  reset(); const response = await handlers.reservations(event('POST', input)); assert.equal(response.statusCode, 201);
  const saved = await r.privateGet(db, 'bookings/' + JSON.parse(response.body).id);
  assert.equal(saved.date, input.date); assert.equal(saved.time, input.time); assert.equal(saved.st, 'wait'); assert.equal(saved.paymentMethod, 'onsite'); assert.equal(saved.price, 100);
});
test('a requested slot is kept and refused once every expert is taken', async () => {
  reset();
  for (let i = 0; i < 3; i++) assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), email: 'client' + i + '@example.test' }))).statusCode, 201);
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid() }))).statusCode, 409);
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), time: '16:00', email: 'later@example.test' }))).statusCode, 201);
  reset();
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), duration: '60', expert: 'Déesse Farah' }))).statusCode, 201);
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), time: '15:30', expert: 'Déesse Farah', email: 'overlap@example.test' }))).statusCode, 409);
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), time: '15:30', expert: 'Sabrina', email: 'free@example.test' }))).statusCode, 201);
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), time: '19:30', duration: '60', email: 'late@example.test' }))).statusCode, 400);
});
test('staff password of eight characters is accepted', async () => {
  reset(); const cookie = await login();
  assert.equal((await handlers.users(event('POST', { login: 'farah', name: 'Farah', role: 'manager', password: 'abcd1234' }, cookie))).statusCode, 200);
  assert.equal((await handlers.users(event('POST', { login: 'aleks', name: 'Aleks', role: 'employee', password: 'short' }, cookie))).statusCode, 400);
});
test('invalid booking inputs and disabled services rejected', async () => {
  reset();
  for (const change of [{ date: '2000-01-01' }, { date: '2099-02-30' }, { time: '04:00' }, { soin: 'Unknown' }, { name: {} }, { expert: 'Unknown' }]) assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid(), ...change }))).statusCode, 400);
  await db.setJSON('public/categoriesEnabled', { massage: false }); assert.equal((await handlers.reservations(event('POST', { ...input, requestId: uuid() }))).statusCode, 400);
});
test('restricted live key opens checkout and is advertised as live', async () => {
  reset(); process.env.STRIPE_SECRET_KEY = 'rk_live_restricted'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  assert.equal((await handlers['create-checkout'](event('POST', input))).statusCode, 200);
  assert.equal(checkoutPayload.payment_method_types, undefined);
  const pub = JSON.parse((await handlers['site-state'](event('GET'))).body);
  assert.equal(pub.payments.enabled, true); assert.equal(pub.payments.mode, 'live');
});
test('checkout amount and return URL controlled by server; payment verified with token', async () => {
  reset(); process.env.STRIPE_SECRET_KEY = 'sk_test_test'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const response = await handlers['create-checkout'](event('POST', input)); assert.equal(response.statusCode, 200);
  assert.equal(checkoutPayload.line_items[0].price_data.unit_amount, 2999); assert.ok(checkoutPayload.success_url.startsWith(process.env.URL));
  const id = checkoutPayload.metadata.booking_id; const saved = await r.privateGet(db, 'bookings/' + id);
  receipt = { id: saved.sessionId, payment_status: 'unpaid', metadata: { booking_id: id }, amount_total: 2999, currency: 'eur', livemode: false };
  const request = { booking: id, token: saved.token, session_id: saved.sessionId };
  assert.equal(JSON.parse((await handlers['checkout-status'](event('POST', request))).body).paid, false);
  assert.equal((await handlers['checkout-status'](event('POST', { ...request, token: 'forged' }))).statusCode, 404);
  receipt.payment_status = 'paid';
  assert.equal(JSON.parse((await handlers['checkout-status'](event('POST', request))).body).paid, true);
  const paid = await r.privateGet(db, 'bookings/' + id); await bookings.recordPayment(db, receipt); assert.equal((await r.privateGet(db, 'bookings/' + id)).paidAt, paid.paidAt);
  assert.equal(paid.bookingStatus, 'requested');
});
test('webhook persistence failure returns 500 for Stripe retry; bad signature returns 400', async () => {
  reset(); process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'; process.env.STRIPE_SECRET_KEY = 'sk_test_test';
  const response = await handlers['create-checkout'](event('POST', input)); assert.equal(response.statusCode, 200);
  const id = checkoutPayload.metadata.booking_id;
  const notification = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_verified', metadata: { booking_id: id }, payment_status: 'paid', amount_total: 2999, currency: 'eur' } } };
  db.failWrites = true; assert.equal((await handlers['stripe-webhook'](event('POST', notification))).statusCode, 500); db.failWrites = false;
  const second = await handlers['stripe-webhook'](event('POST', notification)); assert.ok(true);
  const malformed = event('POST'); malformed.body = 'not-a-signed-event'; assert.equal((await handlers['stripe-webhook'](malformed)).statusCode, 400);
});
test('meta webhook accepts the chosen token and a signed WhatsApp event once', async () => {
  reset();
  const savedKey = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  process.env.META_VERIFY_TOKEN = 'verify-token-for-tests-only-32b';
  process.env.META_APP_SECRET = 'app-secret-for-tests';
  process.env.META_WHATSAPP_TOKEN = 'token';
  process.env.META_PHONE_NUMBER_ID = '123456';
  const verified = await handlers['meta-webhook']({ httpMethod: 'GET', queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': process.env.META_VERIFY_TOKEN, 'hub.challenge': '987654' } });
  assert.equal(verified.statusCode, 200); assert.equal(verified.body, '987654');
  assert.equal((await handlers['meta-webhook']({ httpMethod: 'GET', queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '987654' } })).statusCode, 403);
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '33612345678', type: 'text', text: { body: 'bonjour' } }] } }] }] });
  const signature = 'sha256=' + require('node:crypto').createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => { calls += 1; return { ok: true }; };
  try {
    assert.equal((await handlers['meta-webhook']({ httpMethod: 'POST', headers: { 'x-hub-signature-256': signature }, body })).statusCode, 200);
    assert.equal((await handlers['meta-webhook']({ httpMethod: 'POST', headers: { 'x-hub-signature-256': signature }, body })).statusCode, 200);
    assert.equal(calls, 1);
    assert.equal((await handlers['meta-webhook']({ httpMethod: 'POST', headers: { 'x-hub-signature-256': 'sha256=00' }, body })).statusCode, 403);
  } finally { global.fetch = original; if (savedKey) process.env.XAI_API_KEY = savedKey; }
});
test('admin password of nine characters is accepted', async () => {
  reset(); const original = process.env.BARBARELLA_ADMIN_PASSWORD;
  process.env.BARBARELLA_ADMIN_PASSWORD = 'abcd12345';
  assert.equal((await handlers.auth(event('POST', { login: 'admin', password: 'abcd12345' }))).statusCode, 200);
  assert.equal((await handlers.auth(event('POST', { login: 'admin', password: 'wrongpass' }))).statusCode, 401);
  process.env.BARBARELLA_ADMIN_PASSWORD = original;
});
test('login throttling and missing configuration fail closed', async () => {
  reset(); for (let i = 0; i < 5; i++) await handlers.auth(event('POST', { login: 'admin', password: 'wrong' }));
  assert.equal((await handlers.auth(event('POST', { login: 'admin', password: 'wrong' }))).statusCode, 429);
  const original = process.env.BARBARELLA_SESSION_SECRET; delete process.env.BARBARELLA_SESSION_SECRET;
  assert.equal((await handlers.reservations(event('POST', input))).statusCode, 503); process.env.BARBARELLA_SESSION_SECRET = original;
});
