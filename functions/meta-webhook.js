const r = require('../lib/runtime');
const meta = require('../lib/meta');
exports.handler = async event => {
  if (event.httpMethod === 'GET') {
    const query = event.queryStringParameters || {};
    const challenge = query['hub.challenge'];
    const token = process.env.META_VERIFY_TOKEN;
    if (!token) return r.json(503, { error: 'Vérification Meta non configurée.' });
    if (query['hub.mode'] !== 'subscribe' || !meta.same(query['hub.verify_token'] || '', token)) return r.json(403, { error: 'Vérification refusée.' });
    if (typeof challenge !== 'string' || !challenge || challenge.length > 200 || /[\r\n]/.test(challenge)) return r.json(400, { error: 'Défi invalide.' });
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }, body: challenge };
  }
  if (event.httpMethod !== 'POST') return r.json(405, { error: 'Méthode non autorisée.' });
  if (!process.env.META_APP_SECRET) return r.json(503, { error: 'Signature Meta non configurée.' });
  if (!meta.signed(event)) return r.json(403, { error: 'Signature invalide.' });
  let payload;
  try { payload = JSON.parse(meta.rawBody(event).toString('utf8') || '{}'); }
  catch { return r.json(400, { error: 'JSON invalide.' }); }
  try {
    await meta.replyAll(r.store(event), payload);
    return r.json(200, { received: true });
  } catch (error) {
    console.error('Meta webhook failure:', error.name);
    return r.json(500, { error: 'Traitement à réessayer.' });
  }
};