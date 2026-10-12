const crypto = require('node:crypto');
const r = require('../lib/runtime');

exports.handler = r.wrap(async event => {
  if (event.httpMethod === 'DELETE') {
    const auth = await r.authorize(event);
    await auth.db.delete('sessions/' + auth.id);
    return r.json(200, { ok: true }, { 'Set-Cookie': '__Host-bb_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  if (event.httpMethod === 'GET') return r.json(200, { user: (await r.authorize(event)).user });
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  r.secret();
  const db = r.store(event);
  await r.rateLimit(db, event, 'login', 5);
  const body = r.parse(event);
  const login = r.text(body.login, 80).toLowerCase();
  const password = r.password(body.password);
  let user;
  if (login === 'admin') {
    const expected = process.env.BARBARELLA_ADMIN_PASSWORD;
    if (!expected || expected.length < 8) r.fail(503, 'Mot de passe administrateur à configurer sur Netlify (8 caractères minimum).');
    if (r.equal(password, expected)) user = { id: 1, login: 'admin', name: 'Admin', role: 'admin' };
  } else {
    user = (await r.privateGet(db, 'users') || []).find(u => u.login === login);
    if (!user || !r.passwordMatches(password, user.hash)) user = null;
  }
  if (!user) r.fail(401, 'Identifiants incorrects.');
  const id = crypto.randomBytes(32).toString('hex');
  const version = login === 'admin' ? crypto.createHash('sha256').update(process.env.BARBARELLA_ADMIN_PASSWORD).digest('hex') : user.hash;
  await r.privateSet(db, 'sessions/' + id, { login, version, expires: Date.now() + 28800000 });
  return r.json(200, { user: { id: user.id, login, name: user.name, role: user.role } }, { 'Set-Cookie': r.sessionCookie(id) });
});
