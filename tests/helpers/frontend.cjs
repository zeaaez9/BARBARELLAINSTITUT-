const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const defaults = require('../../lib/defaults');
const html = fs.readFileSync(require.resolve('../../index.html'), 'utf8');
const operations = fs.readFileSync(require.resolve('../../operations.js'), 'utf8');
async function harness(search = '', transport = null) {
  const { document, Event } = parseHTML(html), requests = [], alerts = [], storage = new Map(), serverState = structuredClone(defaults), versions = {};
  // LinkeDOM expose seulement le getter : simuler le setter HTMLSelectElement natif.
  for (const select of document.querySelectorAll('select')) Object.defineProperty(select, 'value', {
    get() { const option = this.querySelector('option[selected]') || this.querySelector('option'); return option?.getAttribute('value') ?? option?.textContent ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) { const match = (option.getAttribute('value') ?? option.textContent) === value; if (match) option.setAttribute('selected', ''); else option.removeAttribute('selected'); } }, configurable: true
  });
  const context = { document, Event, console, URL, URLSearchParams, Intl, Date, Object, JSON, Promise, location: { origin: 'https://barbarella.netlify.app', pathname: '/', search, hash: '', assign(url) { context.redirect = url; } }, history: { replaceState() {} }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, alert: message => alerts.push(message), confirm: () => true, setTimeout: () => 1, setInterval: () => 1, clearInterval() {}, fetch: async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null; requests.push({ url, body, method: opts.method });
    if (transport) return transport(url, opts);
    if (url.includes('site-state') && opts.method === 'PUT') { serverState[body.field] = structuredClone(body.value); versions[body.field] = 'version-' + requests.length; return { ok: true, status: 200, json: async () => ({ ok: true, version: versions[body.field] }) }; }
    const data = url.includes('site-state') ? { state: structuredClone(serverState), versions: { ...versions }, configured: true, payments: { enabled: true, mode: 'test' }, bookings: [], users: [] } : url.endsWith('/auth') ? { user: { id: 1, login: 'admin', name: 'Admin', role: 'admin' } } : url.endsWith('/create-checkout') ? { url: 'https://checkout.stripe.com/test' } : url.endsWith('/checkout-status') ? { paid: true, test: true } : { ok: true, version: 'new-version', id: 'new-booking' };
    return { ok: true, status: 200, json: async () => data };
  } };
  context.crypto = require('node:crypto').webcrypto; context.TextEncoder = TextEncoder; context.Uint8Array = Uint8Array;
  const requestStorage = new Map(); context.sessionStorage = { getItem: key => requestStorage.get(key) || null, setItem: (key, value) => requestStorage.set(key, value) };
  context.window = context;
  vm.createContext(context);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  vm.runInContext(operations, context);
  await new Promise(resolve => setImmediate(resolve));
  return { context, document, requests, alerts, storage, requestStorage, serverState, run: code => vm.runInContext(code, context) };
}
module.exports = { harness };
