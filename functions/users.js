const r = require('../lib/runtime');
const crypto = require('node:crypto');
exports.handler = r.wrap(async event => {
  const { db } = await r.authorize(event, ['admin']);
  const body = r.parse(event);
  if (event.httpMethod === 'DELETE') {
    if (!Number.isSafeInteger(body.id)) r.fail(400, 'Identifiant invalide.');
    await r.privateUpdate(db, 'users', value => (value || []).filter(u => u.id !== body.id));
    return r.json(200, { ok: true });
  }
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const login = r.text(body.login, 80).toLowerCase();
  const name = r.text(body.name, 100);
  if (!/^[a-z0-9_-]{2,80}$/.test(login) || login === 'admin' || /['"`\\]/.test(name)) r.fail(400, 'Identifiant ou nom invalide.');
  if (!['admin', 'manager', 'employee'].includes(body.role)) r.fail(400, 'Rôle invalide.');
  if (body.id != null && !Number.isSafeInteger(body.id)) r.fail(400, 'Identifiant invalide.');
  const password = body.password ?? '';
  if (password !== '' || body.id == null) r.password(password, 12);
  const hash = password !== '' ? r.passwordHash(password) : null;
  await r.privateUpdate(db, 'users', value => {
    const users = value || [];
    const existing = body.id == null ? null : users.find(u => u.id === body.id);
    if (body.id != null && !existing) r.fail(404, 'Compte introuvable.');
    if (users.some(u => u.login === login && u !== existing)) r.fail(409, 'Identifiant déjà utilisé.');
    let id = existing?.id;
    if (!id) do { id = crypto.randomInt(2, 281474976710655); } while (users.some(u => u.id === id));
    const user = { id, login, name, role: body.role, hash: hash || existing.hash };
    if (existing) users[users.indexOf(existing)] = user; else users.push(user);
    return users;
  });
  return r.json(200, { ok: true });
});
