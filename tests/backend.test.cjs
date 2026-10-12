const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
class MemoryStore {
  constructor() { this.data = new Map(); this.sequence = 0; this.failWrites = false; this.failOnceKey = null; }
  async get(key) { return this.data.has(key) ? structuredClone(this.data.get(key).data) : null; }
  async getWithMetadata(key) { return this.data.has(key) ? structuredClone(this.data.get(key)) : null; }
  async setJSON(key, data, options = {}) {
    if (this.failWrites) throw new Error('Storage down');
    if (this.failOnceKey === key) { this.failOnceKey = null; throw new Error('Temporary storage failure'); }
    const existing = this.data.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.sequence); this.data.set(key, { data: structuredClone(data), etag }); return { modified: true, etag };
  }
  async delete(key) { this.data.delete(key); }
  async list({ prefix }) { return { blobs: [...this.data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
}
let db = new MemoryStore(), checkoutPayload, receipt, checkoutCalls = 0, failAfterCheckout = false;
const sessionsByKey = new Map();
class FakeStripe {
  constructor() {
    this.checkout = { sessions: { create: async (payload, options) => {
      checkoutCalls++; checkoutPayload = payload;
      const key = options.idempotencyKey;
      if (sessionsByKey.has(key)) { assert.deepEqual(payload, sessionsByKey.get(key).payload); return sessionsByKey.get(key).session; }
      const session = { id: sessionsByKey.size ? 'cs_test_' + sessionsByKey.size : 'cs_test_verified', url: 'https://checkout.stripe.com/test' };
      sessionsByKey.set(key, { payload: structuredClone(payload), session });
      if (failAfterCheckout) { failAfterCheckout = false; db.failOnceKey = 'bookings/' + payload.metadata.booking_id; }
      return session;
    }, retrieve: async () => receipt } };
    this.webhooks = { constructEvent: body => JSON.parse(Buffer.isBuffer(body) ? body.toString() : body) };
  }
}
const originalLoad = Module._load;
Module._load = function (name, ...args) { if (name === '@netlify/blobs') return { getStore: () => db, connectLambda() {} }; if (name === 'stripe') return FakeStripe; return originalLoad.call(this, name, ...args); };
const r = require('../lib/runtime');
const handlers = Object.fromEntries(['auth', 'site-state', 'users', 'reservations', 'create-checkout', 'checkout-status', 'stripe-webhook', 'agent-run'].map(name => [name, require('../functions/' + name).handler]));
const bookings = require('../lib/bookings');
Module._load = originalLoad;
process.env.URL = 'https://barbarella.netlify.app';
process.env.BARBARELLA_SESSION_SECRET = 'test-only-secret-at-least-thirty-two-characters';
process.env.BARBARELLA_ADMIN_PASSWORD = 'test-only-password-12345';
function event(method, data, cookie, query) { return { httpMethod: method, headers: { origin: process.env.URL, cookie, 'x-nf-client-connection-ip': 'test' }, body: JSON.stringify(data || {}), queryStringParameters: query }; }
async function login(login = 'admin', password = process.env.BARBARELLA_ADMIN_PASSWORD) { const result = await handlers.auth(event('POST', { login, password })); assert.equal(result.statusCode, 200); return result.headers['Set-Cookie'].split(';')[0]; }
function reset() { db = new MemoryStore(); sessionsByKey.clear(); checkoutCalls = 0; failAfterCheckout = false; }
const input = { requestId: '69f2c5dc-7218-4c86-8389-f115f7ebadee', name: 'Amine Test', email: 'amine@example.test', tel: '+33612345678', soin: 'Massage Iris', date: '2099-10-12', time: '15:00', expert: '', duration: '30', amount: 1, success_url: 'https://attacker.test' };

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
test('invalid booking inputs and disabled services rejected', async () => {
  reset();
  for (const change of [{ date: '2000-01-01' }, { date: '2099-02-30' }, { time: '04:00' }, { soin: 'Unknown' }, { name: {} }, { expert: 'Unknown' }]) assert.equal((await handlers.reservations(event('POST', { ...input, ...change }))).statusCode, 400);
  await db.setJSON('public/categoriesEnabled', { massage: false }); assert.equal((await handlers.reservations(event('POST', input))).statusCode, 400);
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
  const notification = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_verified', metadata: { booking_id: id }, payment_status: 'paid', amount_total: 2999, currency: 'eur', livemode: false } } };
  db.failWrites = true; assert.equal((await handlers['stripe-webhook'](event('POST', notification))).statusCode, 500); db.failWrites = false;
  assert.equal((await handlers['stripe-webhook'](event('POST', notification))).statusCode, 200);
  const malformed = event('POST'); malformed.body = 'not-a-signed-event'; assert.equal((await handlers['stripe-webhook'](malformed)).statusCode, 400);
});
test('login throttling and missing configuration fail closed', async () => {
  reset(); for (let i = 0; i < 5; i++) await handlers.auth(event('POST', { login: 'admin', password: 'wrong' }));
  assert.equal((await handlers.auth(event('POST', { login: 'admin', password: 'wrong' }))).statusCode, 429);
  const original = process.env.BARBARELLA_SESSION_SECRET; delete process.env.BARBARELLA_SESSION_SECRET;
  assert.equal((await handlers.reservations(event('POST', input))).statusCode, 503); process.env.BARBARELLA_SESSION_SECRET = original;
});
test('passwords with markup characters and surrounding spaces remain exact at login', async () => {
  reset(); const admin = await login();
  for (const [index, password] of ['Valid<Password>123', '  spaced-password-123  '].entries()) {
    assert.equal((await handlers.users(event('POST', { login: 'user' + index, name: 'Test', role: 'employee', password }, admin))).statusCode, 200);
    assert.equal((await handlers.auth(event('POST', { login: 'user' + index, password }))).statusCode, 200);
  }
  assert.equal((await handlers.auth(event('POST', { login: 'user1', password: 'spaced-password-123' }))).statusCode, 401);
});
test('simultaneous account creations preserve both accounts with distinct IDs', async () => {
  reset(); const admin = await login();
  const responses = await Promise.all(['one', 'two'].map(login => handlers.users(event('POST', { login, name: 'Test', role: 'employee', password: 'account-password-123' }, admin))));
  assert.deepEqual(responses.map(r => r.statusCode), [200, 200]);
  const users = await r.privateGet(db, 'users'); assert.deepEqual(users.map(u => u.login).sort(), ['one', 'two']); assert.equal(new Set(users.map(u => u.id)).size, 2);
});
test('simultaneous edit and delete do not restore a revoked account', async () => {
  reset(); const admin = await login();
  for (const login of ['one', 'two']) await handlers.users(event('POST', { login, name: 'Test', role: 'employee', password: 'account-password-123' }, admin));
  const [one, two] = await r.privateGet(db, 'users');
  const results = await Promise.all([handlers.users(event('DELETE', { id: one.id }, admin)), handlers.users(event('POST', { id: two.id, login: two.login, name: 'Updated', role: 'employee', password: '' }, admin))]);
  assert.deepEqual(results.map(r => r.statusCode), [200, 200]);
  const users = await r.privateGet(db, 'users'); assert.equal(users.length, 1); assert.equal(users[0].id, two.id); assert.equal(users[0].name, 'Updated');
});
test('same request repeated concurrently creates one booking and one Stripe session', async () => {
  reset(); process.env.STRIPE_SECRET_KEY = 'sk_test_test'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const results = await Promise.all([handlers['create-checkout'](event('POST', input)), handlers['create-checkout'](event('POST', input))]);
  assert.deepEqual(results.map(r => r.statusCode), [200, 200]); assert.equal(sessionsByKey.size, 1);
  assert.equal((await db.list({ prefix: 'bookings/' })).blobs.length, 1);
  await handlers['create-checkout'](event('POST', input)); assert.equal(sessionsByKey.size, 1);
  assert.equal((await handlers['create-checkout'](event('POST', { ...input, time: '16:00' }))).statusCode, 409);
});
test('retry after Stripe succeeds but storage fails reuses original session', async () => {
  reset(); process.env.STRIPE_SECRET_KEY = 'sk_test_test'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'; failAfterCheckout = true;
  assert.equal((await handlers['create-checkout'](event('POST', input))).statusCode, 503);
  assert.equal((await handlers['create-checkout'](event('POST', input))).statusCode, 200);
  assert.equal(checkoutCalls, 2); assert.equal(sessionsByKey.size, 1); assert.equal((await db.list({ prefix: 'bookings/' })).blobs.length, 1);
});
test('onsite request retries are deduplicated and missing references rejected', async () => {
  reset(); await handlers.reservations(event('POST', input)); await handlers.reservations(event('POST', input));
  assert.equal((await db.list({ prefix: 'bookings/' })).blobs.length, 1);
  assert.equal((await handlers.reservations(event('POST', { ...input, requestId: undefined }))).statusCode, 400);
});
test('payment mode is recorded and mismatched modes cannot mark a booking paid', async () => {
  reset(); process.env.STRIPE_SECRET_KEY = 'sk_test_test'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  await handlers['create-checkout'](event('POST', input));
  const id = checkoutPayload.metadata.booking_id;
  const session = { id: 'cs_test_verified', metadata: { booking_id: id }, payment_status: 'paid', amount_total: 2999, currency: 'eur', livemode: true };
  await assert.rejects(bookings.recordPayment(db, session), /Mode Stripe incohérent/);
  assert.equal((await r.privateGet(db, 'bookings/' + id)).st, 'wait');
  session.livemode = false; await bookings.recordPayment(db, session); assert.equal((await r.privateGet(db, 'bookings/' + id)).paymentMode, 'test');
});
test('schemas reject wrong types and shapes without storing them', async () => {
  reset(); const admin = await login();
  const cases = [ ['categoriesEnabled', []], ['categoriesEnabled', { massage: 'yes', epilation: true, manucure: true, produits: true }], ['promo', { title: 'Offre', desc: 12 }], ['stockData', { Product: -1 }], ['stockData', { Product: '2' }], ['invConfig', { seuilGlobal: 3, cycleJours: 0 }], ['lastInventaire', 'not-a-date'], ['services', [{ name: 'Test', cat: 'massage', price: 1, price30: -5, dur: '1 h', desc: '' }]], ['clients', [{ id: 1, name: 'Client', email: 'invalid', tag: 'VIP' }]] ];
  for (const [field, value] of cases) {
    const response = await handlers['site-state'](event('PUT', { field, value, version: null }, admin)); assert.equal(response.statusCode, 400, field);
    assert.equal(await db.get((['categoriesEnabled', 'promo', 'services'].includes(field) ? 'public/' : 'private/') + field), null);
  }
});
test('schemas accept existing catalog and every supported state field', () => {
  const { validate } = require('../lib/schema'), defaults = require('../lib/defaults');
  for (const [field, value] of Object.entries(defaults)) assert.doesNotThrow(() => validate(field, value), field);
  for (const [field, value] of Object.entries({ clients: [], aiAgents: [], stockData: { Product: 2 }, stockSeuils: {}, invHistory: [{ date: '12/10/2026', by: 'Admin', summary: '2 produits' }], lastInventaire: new Date().toISOString(), invConfig: { seuilGlobal: 3, cycleJours: 14 } })) assert.doesNotThrow(() => validate(field, value), field);
});
test('actual browser forms persist price and category through real API handlers', async () => {
  reset(); const cookie = await login();
  const { harness } = require('./helpers/frontend.cjs');
  const h = await harness('', async (url, options) => {
    const target = new URL(url, process.env.URL);
    const result = await handlers[target.pathname.split('/').at(-1)](event(options.method || 'GET', options.body ? JSON.parse(options.body) : {}, cookie, Object.fromEntries(target.searchParams)));
    return { ok: result.statusCode < 400, status: result.statusCode, json: async () => JSON.parse(result.body) };
  });
  h.run("currentUser={id:1,role:'admin'};openServiceForm(0)"); h.document.getElementById('svc-price').value = '181';
  await h.run('saveServiceForm()'); assert.equal((await db.get('public/services'))[0].price, 181);
  await h.run("toggleCategory('massage',false)"); assert.equal((await db.get('public/categoriesEnabled')).massage, false);
  await h.run('refreshPublic()'); assert.equal(h.run('services[0].price'), 181); assert.equal(h.run('categoriesEnabled.massage'), false);
});
test('existing administrator configuration with eight characters remains supported', async () => {
  reset(); const original = process.env.BARBARELLA_ADMIN_PASSWORD; process.env.BARBARELLA_ADMIN_PASSWORD = 'Admin123';
  try { assert.equal((await handlers.auth(event('POST', { login: 'admin', password: 'Admin123' }))).statusCode, 200); }
  finally { process.env.BARBARELLA_ADMIN_PASSWORD = original; }
});
test('restricted live Stripe keys retain live mode and checkout settings', async () => {
  reset(); const original = process.env.STRIPE_SECRET_KEY; process.env.STRIPE_SECRET_KEY = 'rk_live_test'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  try {
    const response = await handlers['create-checkout'](event('POST', input)); assert.equal(response.statusCode, 200);
    const booking = await r.privateGet(db, 'bookings/' + checkoutPayload.metadata.booking_id); assert.equal(booking.paymentMode, 'live');
    assert.equal(checkoutPayload.payment_method_types, undefined);
    const state = JSON.parse((await handlers['site-state'](event('GET'))).body); assert.equal(state.payments.mode, 'live'); assert.equal(state.payments.enabled, true);
  } finally { process.env.STRIPE_SECRET_KEY = original; }
});
test('function wrapper preserves Netlify context', async () => {
  const handler = r.wrap(async (event, context) => r.json(200, { marker: context.marker }));
  const result = await handler(event('GET'), { marker: 'netlify-context' }); assert.equal(JSON.parse(result.body).marker, 'netlify-context');
});
