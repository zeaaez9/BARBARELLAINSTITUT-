const r = require('../lib/runtime');
const defaults = require('../lib/defaults');
const { validate: clean } = require('../lib/schema');
const publicFields = ['services', 'categoriesEnabled', 'team', 'news', 'promo', 'waLinks'];
const privateFields = ['clients', 'aiAgents', 'stockData', 'stockSeuils', 'invHistory', 'lastInventaire', 'invConfig'];
const employeeFields = ['stockData', 'stockSeuils', 'invHistory', 'lastInventaire', 'invConfig'];
exports.handler = r.wrap(async event => {
  const db = r.store(event);
  if (event.httpMethod === 'GET' && event.queryStringParameters?.scope !== 'pro') {
    const state = {}, versions = {};
    for (const key of publicFields) {
      const entry = await db.getWithMetadata('public/' + key, { type: 'json' });
      state[key] = entry ? entry.data : defaults[key]; versions[key] = entry?.etag ?? null;
    }
    const enabled = /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '') && /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || '') && (process.env.BARBARELLA_SESSION_SECRET || '').length >= 32;
    return r.json(200, { state, versions, configured: Array.isArray(state.services), payments: { enabled, mode: /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || '') ? 'live' : 'test' } });
  }
  const { user } = await r.authorize(event);
  const allowed = user.role === 'employee' ? employeeFields : publicFields.concat(privateFields);
  if (event.httpMethod === 'GET') {
    const state = {}, versions = {};
    for (const key of allowed) {
      const entry = await db.getWithMetadata((publicFields.includes(key) ? 'public/' : 'private/') + key, { type: 'json' });
      state[key] = publicFields.includes(key) ? (entry ? entry.data : defaults[key]) : r.unseal(entry?.data);
      versions[key] = entry?.etag ?? null;
    }
    const { blobs } = await db.list({ prefix: 'bookings/' });
    const bookings = (await Promise.all(blobs.map(b => r.privateGet(db, b.key)))).filter(Boolean).map(({ token, checkoutUrl, sessionId, ...booking }) => booking);
    const accounts = user.role === 'admin' ? (await r.privateGet(db, 'users') || []).map(({ hash, ...u }) => u) : [];
    return r.json(200, { state, versions, bookings, users: [{ id: 1, login: 'admin', name: 'Admin', role: 'admin' }, ...accounts] });
  }
  if (event.httpMethod !== 'PUT') r.fail(405, 'Méthode non autorisée.');
  const { field, value, version } = r.parse(event);
  if (!allowed.includes(field)) r.fail(403, 'Champ non autorisé.');
  clean(field, value);
  if (version !== null && typeof version !== 'string') r.fail(400, 'Version de sauvegarde manquante.');
  const key = (publicFields.includes(field) ? 'public/' : 'private/') + field;
  const result = await db.setJSON(key, publicFields.includes(field) ? value : r.seal(value), version === null ? { onlyIfNew: true } : { onlyIfMatch: version });
  if (!result.modified) r.fail(409, 'Ces données ont changé sur un autre appareil. Actualisez avant de réessayer.');
  return r.json(200, { ok: true, version: result.etag });
});
