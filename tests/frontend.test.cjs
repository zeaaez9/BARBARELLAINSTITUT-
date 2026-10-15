const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const defaults = require('../lib/defaults');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const operations = fs.readFileSync(require.resolve('../operations.js'), 'utf8');
async function harness(search = '') {
  const { document, Event } = parseHTML(html), requests = [], alerts = [], storage = new Map();
  // LinkeDOM expose seulement le getter : simuler le setter HTMLSelectElement natif.
  for (const select of document.querySelectorAll('select')) Object.defineProperty(select, 'value', {
    get() { const option = this.querySelector('option[selected]') || this.querySelector('option'); return option?.getAttribute('value') ?? option?.textContent ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) { const match = (option.getAttribute('value') ?? option.textContent) === value; if (match) option.setAttribute('selected', ''); else option.removeAttribute('selected'); } }, configurable: true
  });
  const context = { document, Event, console, URL, URLSearchParams, Intl, Date, Object, JSON, Promise, location: { origin: 'https://barbarella.netlify.app', pathname: '/', search, hash: '', assign(url) { context.redirect = url; } }, history: { replaceState() {} }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, alert: message => alerts.push(message), confirm: () => true, setTimeout: () => 1, setInterval: () => 1, clearInterval() {}, fetch: async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null; requests.push({ url, body, method: opts.method });
    const data = url.includes('site-state') ? { state: defaults, versions: {}, configured: true, payments: { enabled: true, mode: 'test' }, bookings: [], users: [] } : url.endsWith('/auth') ? { user: { id: 1, login: 'admin', name: 'Admin', role: 'admin' } } : url.endsWith('/create-checkout') ? { url: 'https://checkout.stripe.com/test' } : url.endsWith('/checkout-status') ? { paid: true, test: true } : { ok: true, version: 'new-version', id: 'new-booking' };
    return { ok: true, status: 200, json: async () => data };
  } };
  context.window = context;
  vm.createContext(context);
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(match[1] || '')) continue;
    vm.runInContext(match[2], context);
  }
  vm.runInContext(operations, context);
  await new Promise(resolve => setImmediate(resolve));
  return { context, document, requests, alerts, run: code => vm.runInContext(code, context) };
}
test('page and server integration initialize without script errors', async () => {
  const h = await harness(); assert.ok(h.document.getElementById('prest-detail').innerHTML); assert.ok(h.requests.some(r => r.url.endsWith('/site-state')));
  assert.equal(h.document.querySelector('#cc'), null); assert.equal(h.run('users.length'), 0); assert.equal(h.run('clients.length'), 0);
});
test('all eleven admin tabs and role restrictions work', async () => {
  const h = await harness(); h.run("currentUser={id:1,name:'Admin',role:'admin'};buildSide();renderAllPro();renderStats()");
  for (const tab of ['dash', 'agenda', 'catalog', 'inventaire', 'promos', 'news', 'clients', 'team', 'roles', 'ai', 'admin']) { h.run("goView('" + tab + "')"); assert.ok(!h.document.getElementById('view-' + tab).classList.contains('hidden')); }
  h.run("currentUser={role:'employee'};goView('admin')"); assert.match(h.alerts.at(-1), /non autorisé/);
  assert.match(h.document.getElementById('agenda').textContent, /Aucune demande/); assert.ok(!h.document.getElementById('live-stats').textContent.includes('1 240'));
});
test('public prestation and booking tabs switch correctly', async () => {
  const h = await harness();
  for (const cat of ['massage', 'epilation', 'manucure', 'produits']) { h.run("switchCat('" + cat + "');switchBookCat('" + cat + "')"); assert.equal(h.run('currentCat'), cat); assert.equal(h.run('bookCat'), cat); }
  h.run("showPrestByGlobalIdx(6);switchSurMesureTab('comp')"); assert.ok(!h.document.getElementById('sm-panel-comp').classList.contains('hidden'));
});
test('catalog refresh preserves selected care, duration and expert', async () => {
  const h = await harness(); h.run("selectPkg(2,document.querySelector('.pkg[data-idx=\"2\"]'),'30')");
  h.document.getElementById('ms').value = 'Déesse Farah';
  await h.run('refreshPublic()');
  assert.equal(h.run('selService.name'), 'Massage Aphrodisiaque'); assert.equal(h.run('prestSel[2]'), '30'); assert.equal(h.document.getElementById('ms').value, 'Déesse Farah');
});
test('forged paid query never confirms a payment', async () => {
  const h = await harness('?paid=1'); assert.ok(h.alerts.some(x => /preuve de paiement/.test(x))); assert.ok(h.document.getElementById('book-ok').classList.contains('hidden'));
});
test('Stripe return verified server-side and test mode disclosed', async () => {
  const h = await harness('?session_id=cs_test_verified&booking=uuid&token=secret'); assert.ok(h.requests.some(r => r.url.endsWith('/checkout-status') && r.body.token === 'secret')); assert.match(h.document.getElementById('book-ok').textContent, /aucun montant réel/);
});
test('chat text rendered without HTML injection', async () => {
  const h = await harness(); h.run("addUser('<img src=x onerror=alert(1)>')"); assert.equal(h.document.querySelector('#chat-body img'), null); assert.match(h.document.getElementById('chat-body').textContent, /<img/);
});
test('catalog mutation persists to backend and does not claim local-only success', async () => {
  const h = await harness(); h.run("currentUser={role:'admin'}"); h.document.getElementById('pr-title').value = 'Offre nouvelle'; h.document.getElementById('pr-desc').value = 'Texte';
  await h.run('publishPromo()'); const request = h.requests.find(r => r.method === 'PUT' && r.body.field === 'promo'); assert.equal(request.body.value.title, 'Offre nouvelle'); assert.ok(h.alerts.some(x => /tous les appareils/.test(x)));
});
