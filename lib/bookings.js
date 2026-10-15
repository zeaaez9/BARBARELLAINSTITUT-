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
  if (!name || /['\"`\\]/.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /['\"`\\]/.test(email) || !/^[+\d ().-]{6,40}$/.test(tel)) r.fail(400, 'Coordonnées invalides.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date || date < today) r.fail(400, 'Date invalide ou passée.');
  if (!/^(1[1-9]):(00|30)$/.test(time)) r.fail(400, 'Horaire invalide (11 h à 19 h 30).');
  const expert = team.find(t => (String(t.id) === String(input.expert) || t.name === input.expert) && t.visible !== false);
  if (input.expert && !expert) r.fail(400, 'Experte indisponible.');
  const duration = input.duration === '30' && service.price30 ? '30' : '60';
  return { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'), client: name, email, tel, soin: service.name, date, time, expert: expert?.name || 'Sans préférence', duration, price: duration === '30' ? service.price30 : service.price, acompte: deposit(service) / 100, st: 'wait', bookingStatus: 'requested', createdAt: new Date().toISOString() };
}
async function claimRequest(db, input, paymentMethod, mode = null) {
  if (typeof input.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) r.fail(400, 'Référence de demande invalide.');
  const identity = JSON.stringify([paymentMethod, mode, ...['name', 'email', 'tel', 'soin', 'date', 'time', 'expert', 'duration'].map(k => input[k] ?? '')]);
  const fingerprint = crypto.createHash('sha256').update(identity).digest('hex');
  const key = 'requests/' + input.requestId.toLowerCase();
  const existing = await r.privateGet(db, key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) r.fail(409, 'Cette référence correspond à une autre demande.');
    return existing.booking;
  }
  const booking = await prepare(db, input);
  booking.paymentMethod = paymentMethod; booking.paymentMode = mode;
  if (paymentMethod === 'onsite') booking.acompte = 0;
  const saved = await db.setJSON(key, r.seal({ fingerprint, booking }), { onlyIfNew: true });
  if (saved.modified) return booking;
  const winner = await r.privateGet(db, key);
  if (!winner || winner.fingerprint !== fingerprint) r.fail(409, 'Cette référence correspond à une autre demande.');
  return winner.booking;
}
async function ensureBooking(db, booking) {
  await db.setJSON('bookings/' + booking.id, r.seal(booking), { onlyIfNew: true });
  return r.privateGet(db, 'bookings/' + booking.id);
}
function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}
function halfHours(time, duration) {
  const start = minutes(time);
  const end = start + Number(duration);
  if (end > 20 * 60) r.fail(400, 'Le soin dépasse l’horaire de fermeture (20 h).');
  const slots = [];
  for (let cursor = start; cursor < end; cursor += 30) slots.push(String(Math.floor(cursor / 60)).padStart(2, '0') + ':' + String(cursor % 60).padStart(2, '0'));
  return slots;
}
function overlaps(left, right) {
  if (left.date !== right.date) return false;
  const leftStart = minutes(left.time), rightStart = minutes(right.time);
  return leftStart < rightStart + Number(right.duration) && rightStart < leftStart + Number(left.duration);
}
function holds(booking, now) {
  if (!booking || booking.bookingStatus === 'cancelled') return false;
  if (booking.paymentMethod === 'onsite' || booking.st === 'paid') return true;
  return now - Date.parse(booking.createdAt || 0) < 30 * 60 * 1000;
}
async function activeBookings(db, now) {
  const listed = await db.list({ prefix: 'bookings/' });
  const bookings = await Promise.all((listed.blobs || []).map(blob => r.privateGet(db, blob.key)));
  return bookings.filter(booking => holds(booking, now));
}
async function release(db, booking) {
  for (const key of booking.holds || []) {
    if (await db.get(key, { type: 'json' }) === booking.id) await db.delete(key);
  }
}
async function reserve(db, booking) {
  const now = Date.now();
  const team = (await db.get('public/team', { type: 'json' }) || defaults.team).filter(member => member.visible !== false);
  const experts = team.map(member => member.name);
  if (!experts.length) r.fail(400, 'Aucune experte disponible.');
  const active = (await activeBookings(db, now)).filter(other => other.id !== booking.id && overlaps(other, booking));
  const namedBusy = new Set(active.filter(other => other.expert !== 'Sans préférence').map(other => other.expert));
  const flexible = active.filter(other => other.expert === 'Sans préférence').length;
  let chosen = booking.expert;
  if (chosen === 'Sans préférence') {
    const available = experts.filter(name => !namedBusy.has(name)).slice(flexible);
    if (!available.length) r.fail(409, 'Ce créneau est déjà retenu.');
    chosen = available[0];
  } else if (!experts.includes(chosen) || namedBusy.has(chosen) || flexible > experts.filter(name => name !== chosen && !namedBusy.has(name)).length) {
    r.fail(409, 'Ce créneau est déjà retenu.');
  }
  booking.expert = chosen;
  const keys = halfHours(booking.time, booking.duration).map(slot => 'holds/' + booking.date + '/' + chosen + '/' + slot);
  const claimed = [];
  try {
    for (const key of keys) {
      const existing = await db.get(key, { type: 'json' });
      if (existing === booking.id) { claimed.push(key); continue; }
      if (existing) {
        const other = await r.privateGet(db, 'bookings/' + existing);
        if (holds(other, now)) r.fail(409, 'Ce créneau est déjà retenu.');
        await db.delete(key);
      }
      const saved = await db.setJSON(key, booking.id, { onlyIfNew: true });
      if (!saved.modified && await db.get(key, { type: 'json' }) !== booking.id) r.fail(409, 'Ce créneau est déjà retenu.');
      claimed.push(key);
    }
  } catch (error) {
    booking.holds = claimed;
    await release(db, booking);
    throw error;
  }
  booking.holds = keys;
  return booking;
}
async function recordPayment(db, session) {
  const id = session.metadata?.booking_id;
  if (!id) r.fail(400, 'Réservation absente de cette session.');
  return r.privateUpdate(db, 'bookings/' + id, booking => {
    if (!booking || booking.sessionId !== session.id) r.fail(404, 'Réservation introuvable.');
    if (session.payment_status !== 'paid') return booking;
    if (typeof session.livemode !== 'boolean') r.fail(409, 'Mode Stripe absent.');
    const mode = session.livemode ? 'live' : 'test';
    if (booking.paymentMode && booking.paymentMode !== mode) r.fail(409, 'Mode Stripe incohérent.');
    if (session.currency !== 'eur' || session.amount_total !== Math.round(booking.acompte * 100)) r.fail(409, 'Montant de paiement incohérent.');
    booking.paymentMode = mode;
    if (booking.st !== 'paid') { booking.st = 'paid'; booking.paidAt = new Date().toISOString(); }
    return booking;
  });
}
module.exports = { deposit, prepare, claimRequest, ensureBooking, recordPayment, reserve, release };
