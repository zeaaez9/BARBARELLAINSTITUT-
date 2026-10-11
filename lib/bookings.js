const crypto = require('node:crypto');
const r = require('./runtime');
const defaults = require('./defaults');
function deposit(service) {
  if (service.cat === 'produits') return 0;
  if (service.cat === 'manucure') return 999;
  if (service.cat === 'epilation' && !/intégral|integral/i.test(service.name)) return 499;
  return 2999;
}
async function prepare(db, input) {
  r.secret();
  const services = await db.get('public/services', { type: 'json' }) || defaults.services;
  const categories = await db.get('public/categoriesEnabled', { type: 'json' }) || defaults.categoriesEnabled;
  const team = await db.get('public/team', { type: 'json' }) || defaults.team;
  const service = services?.find(s => s.name === input.soin && s.cat !== 'produits' && categories?.[s.cat] !== false);
  if (!service) r.fail(400, 'Prestation indisponible.');
  const name = r.text(input.name, 100), email = r.text(input.email, 200).toLowerCase(), tel = r.text(input.tel, 40);
  const date = r.text(input.date, 10), time = r.text(input.time, 5);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!name || /['"`\\]/.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /['"`\\]/.test(email) || !/^[+\d ().-]{6,40}$/.test(tel)) r.fail(400, 'Coordonnées invalides.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date || date < today) r.fail(400, 'Date invalide ou passée.');
  if (!/^(1[1-9]):(00|30)$/.test(time)) r.fail(400, 'Horaire invalide (11 h à 19 h 30).');
  const expert = team.find(t => (String(t.id) === String(input.expert) || t.name === input.expert) && t.visible !== false);
  if (input.expert && !expert) r.fail(400, 'Experte indisponible.');
  const duration = input.duration === '30' && service.price30 ? '30' : '60';
  return { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'), client: name, email, tel, soin: service.name, date, time, expert: expert?.name || 'Sans préférence', duration, price: duration === '30' ? service.price30 : service.price, acompte: deposit(service) / 100, st: 'wait', bookingStatus: 'requested', createdAt: new Date().toISOString() };
}
async function recordPayment(db, session) {
  const id = session.metadata?.booking_id;
  if (!id) r.fail(400, 'Réservation absente de cette session.');
  const booking = await r.privateGet(db, 'bookings/' + id);
  if (!booking || booking.sessionId !== session.id) r.fail(404, 'Réservation introuvable.');
  if (session.payment_status !== 'paid') return booking;
  if (session.currency !== 'eur' || session.amount_total !== Math.round(booking.acompte * 100)) r.fail(409, 'Montant de paiement incohérent.');
  if (booking.st !== 'paid') {
    booking.st = 'paid'; booking.paidAt = new Date().toISOString();
    await r.privateSet(db, 'bookings/' + id, booking);
  }
  return booking;
}
module.exports = { deposit, prepare, recordPayment };
