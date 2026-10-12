const r = require('../lib/runtime');
exports.handler = r.wrap(async event => {
  const { db } = await r.authorize(event, ['admin']);
  const body = r.parse(event);
  const users = await r.privateGet(db, 'users') || [];
  if (event.httpMethod === 'DELETE') {
    await r.privateSet(db, 'users', users.filter(u => u.id !== body.id));
    return r.json(200, { ok: true });
  }
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const login = r.text(body.login, 80).toLowerCase();
  const name = r.text(body.name, 100);
  if (!/^[a-z0-9_-]{2,80}$/.test(login) || login === 'admin' || /['"`\\]/.test(name)) r.fail(400, 'Identifiant ou nom invalide.');
  if (!['admin', 'manager', 'employee'].includes(body.role)) r.fail(400, 'Rôle invalide.');
  const existing = users.find(u => u.id === body.id);
  if (users.some(u => u.login === login && u !== existing)) r.fail(409, 'Identifiant déjà utilisé.');
  const password = typeof body.password === 'string' ? body.password : '';
  if ((!existing || password) && (password.length < 12 || password.length > 200)) r.fail(400, 'Mot de passe : 12 à 200 caractères.');
  const user = { id: existing?.id || Date.now(), login, name, role: body.role, hash: password ? r.passwordHash(password) : existing.hash };
  if (existing) users[users.indexOf(existing)] = user; else users.push(user);
  await r.privateSet(db, 'users', users);
  return r.json(200, { ok: true });
});
