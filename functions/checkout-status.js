const Stripe = require('stripe');
const r = require('../lib/runtime');
const { recordPayment } = require('../lib/bookings');
exports.handler = r.wrap(async event => {
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const { booking: id, token, session_id: sessionId } = r.parse(event);
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || typeof token !== 'string') r.fail(400, 'Référence invalide.');
  const db = r.store(event);
  await r.rateLimit(db, event, 'receipt', 20);
  const booking = await r.privateGet(db, 'bookings/' + id);
  if (!booking || !r.equal(booking.token, token) || booking.sessionId !== sessionId) r.fail(404, 'Réservation introuvable.');
  if (!process.env.STRIPE_SECRET_KEY) r.fail(503, 'Paiement indisponible.');
  const session = await new Stripe(process.env.STRIPE_SECRET_KEY).checkout.sessions.retrieve(sessionId);
  const saved = await recordPayment(db, session);
  return r.json(200, { paid: saved.st === 'paid', bookingStatus: saved.bookingStatus, test: session.livemode === false });
});
