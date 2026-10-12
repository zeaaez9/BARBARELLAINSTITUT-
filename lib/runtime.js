const crypto = require('node:crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

function fail(statusCode, message) { throw Object.assign(new Error(message), { statusCode }); }
function json(statusCode, data, extra = {}) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }, body: JSON.stringify(data) };
}
function parse(event) {
  if ((event.body || '').length > 5000000) fail(413, 'Requête trop volumineuse.');
  try {
    const value = JSON.parse(event.body || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Objet JSON attendu.');
    return value;
  } catch { fail(400, 'JSON invalide.'); }
}
function origin() {
  const raw = process.env.URL || process.env.SITE_URL;
  if (!raw) fail(503, 'URL du site non configurée.');
  return new URL(raw).origin;
}
function sameOrigin(event) {
  const value = event.headers?.origin || event.headers?.Origin;
  if (value && value !== origin()) fail(403, 'Origine non autorisée.');
}
function wrap(fn) {
  return async (event, context) => {
    try { if (event.httpMethod !== 'GET') sameOrigin(event); return await fn(event, context); }
    catch (error) {
      if (!error.statusCode) console.error('Function failure:', error.name);
      return json(error.statusCode || 503, { error: error.statusCode ? error.message : 'Service temporairement indisponible.' });
    }
  };
}
function store(event) {
  if (event.blobs) connectLambda(event);
  return getStore({ name: 'barbarella-operations' });
}
function secret() {
  const value = process.env.BARBARELLA_SESSION_SECRET;
  if (!value || value.length < 32) fail(503, 'Accès pro à configurer sur Netlify.');
  return value;
}
function seal(data) {
  const key = crypto.createHash('sha256').update(secret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: bytes.toString('base64') };
}
function unseal(value) {
  if (!value) return null;
  const key = crypto.createHash('sha256').update(secret()).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString());
}
async function privateGet(db, key) { return unseal(await db.get(key, { type: 'json' })); }
async function privateSet(db, key, data) { return db.setJSON(key, seal(data)); }
function equal(a, b) {
  const left = Buffer.from(String(a)), right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function passwordMatches(password, hash) {
  if (typeof hash !== 'string') return false;
  const [salt, digest] = hash.split(':');
  return !!digest && equal(crypto.scryptSync(password, salt, 64).toString('hex'), digest);
}
function sessionCookie(id) { return '__Host-bb_session=' + id + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'; }
async function authorize(event, roles = ['admin', 'manager', 'employee']) {
  secret();
  const cookie = event.headers?.cookie || event.headers?.Cookie || '';
  const id = cookie.match(/(?:^|;\s*)__Host-bb_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!id) fail(401, 'Connectez-vous à l’espace pro.');
  const db = store(event);
  const session = await privateGet(db, 'sessions/' + id);
  if (!session || session.expires < Date.now()) fail(401, 'Session expirée.');
  let user;
  if (session.login === 'admin' && session.version === crypto.createHash('sha256').update(process.env.BARBARELLA_ADMIN_PASSWORD || '').digest('hex')) user = { id: 1, login: 'admin', name: 'Admin', role: 'admin' };
  else user = (await privateGet(db, 'users') || []).find(u => u.login === session.login && u.hash === session.version);
  if (!user) fail(401, 'Accès révoqué.');
  if (!roles.includes(user.role)) fail(403, 'Action non autorisée pour ce rôle.');
  return { db, user: { id: user.id, login: user.login, name: user.name, role: user.role }, id };
}
function text(value, max = 500) {
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u0008]/.test(value)) fail(400, 'Texte invalide.');
  return value.trim();
}
async function rateLimit(db, event, scope, limit = 10) {
  const ip = event.headers?.['x-nf-client-connection-ip'] || 'unknown';
  const key = 'rate/' + scope + '/' + crypto.createHash('sha256').update(ip).digest('hex');
  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await db.getWithMetadata(key, { type: 'json' });
    const now = Date.now();
    const value = entry?.data?.until > now ? entry.data : { count: 0, until: now + 60000 };
    if (value.count >= limit) fail(429, 'Trop de requêtes. Réessayez dans une minute.');
    value.count++;
    const saved = await db.setJSON(key, value, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (saved.modified) return;
  }
  fail(429, 'Trop de requêtes simultanées. Réessayez.');
}
module.exports = { fail, json, parse, origin, sameOrigin, wrap, store, secret, seal, unseal, privateGet, privateSet, equal, passwordHash, passwordMatches, sessionCookie, authorize, text, rateLimit };
