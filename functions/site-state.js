const r = require('../lib/runtime');
const defaults = require('../lib/defaults');
const publicFields = ['services', 'categoriesEnabled', 'team', 'news', 'promo', 'waLinks'];
const privateFields = ['clients', 'aiAgents', 'stockData', 'stockSeuils', 'invHistory', 'lastInventaire', 'invConfig'];
const employeeFields = ['stockData', 'stockSeuils', 'invHistory', 'lastInventaire', 'invConfig'];
function clean(value, field) {
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > 4000000) r.fail(400, 'Données trop volumineuses.');
  function walk(v, key) {
    if (typeof v === 'string') {
      r.text(v, key === 'photo' ? 3000000 : 10000);
      if (key === 'photo' && !(/^https:\/\//.test(v) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))) r.fail(400, 'Photo invalide.');
      if (['name', 'title', 'login', 'email', 'photo', 'id'].includes(key) && /['"`\\]/.test(v)) r.fail(400, 'Caractères non autorisés dans ce champ.');
    } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  }
  walk(value, field);
  if (['team', 'news', 'clients', 'aiAgents'].includes(field) && Array.isArray(value)) value.forEach(item => {
    if (field === 'aiAgents' ? !/^[a-z0-9_-]+$/.test(String(item.id)) : !(typeof item.id === 'number' && Number.isSafeInteger(item.id) || field === 'clients' && /^[a-f0-9-]{36}$/.test(String(item.id)))) r.fail(400, 'Identifiant invalide.');
  });
  if (['services', 'team', 'news', 'clients', 'aiAgents', 'invHistory'].includes(field) && !Array.isArray(value)) r.fail(400, 'Liste attendue.');
  if (field === 'services') value.forEach(s => {
    if (!s.name || !['massage', 'epilation', 'manucure', 'produits'].includes(s.cat) || !Number.isFinite(s.price) || s.price < 0) r.fail(400, 'Prestation invalide.');
  });
  if (field === 'waLinks') Object.values(value).forEach(url => { if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//.test(url)) r.fail(400, 'Lien WhatsApp invalide.'); });
  return value;
}
exports.handler = r.wrap(async event => {
  const db = r.store(event);
  if (event.httpMethod === 'GET' && event.queryStringParameters?.scope !== 'pro') {
    const state = {}, versions = {};
    for (const key of publicFields) {
      const entry = await db.getWithMetadata('public/' + key, { type: 'json' });
      state[key] = entry ? entry.data : defaults[key]; versions[key] = entry?.etag ?? null;
    }
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    const payments = { enabled: /^(sk|rk)_(test|live)_/.test(stripeKey) && /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || ''), mode: stripeKey.includes('_live_') ? 'live' : 'test' };
    return r.json(200, { state, versions, configured: Array.isArray(state.services), payments });
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
    const bookings = await Promise.all(blobs.map(b => r.privateGet(db, b.key)));
    const accounts = user.role === 'admin' ? (await r.privateGet(db, 'users') || []).map(({ hash, ...u }) => u) : [];
    return r.json(200, { state, versions, bookings, users: [{ id: 1, login: 'admin', name: 'Admin', role: 'admin' }, ...accounts] });
  }
  if (event.httpMethod !== 'PUT') r.fail(405, 'Méthode non autorisée.');
  const { field, value, version } = r.parse(event);
  if (!allowed.includes(field)) r.fail(403, 'Champ non autorisé.');
  clean(value, field);
  if (version !== null && typeof version !== 'string') r.fail(400, 'Version de sauvegarde manquante.');
  const key = (publicFields.includes(field) ? 'public/' : 'private/') + field;
  const result = await db.setJSON(key, publicFields.includes(field) ? value : r.seal(value), version === null ? { onlyIfNew: true } : { onlyIfMatch: version });
  if (!result.modified) r.fail(409, 'Ces données ont changé sur un autre appareil. Actualisez avant de réessayer.');
  return r.json(200, { ok: true, version: result.etag });
});
