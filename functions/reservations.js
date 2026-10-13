const r = require('../lib/runtime');
const { prepare, reserve, release } = require('../lib/bookings');
exports.handler = r.wrap(async event => {
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const db = r.store(event);
  await r.rateLimit(db, event, 'booking', 10);
  const booking = await prepare(db, r.parse(event));
  booking.acompte = 0; booking.paymentMethod = 'onsite';
  await reserve(db, booking);
  try { await r.privateSet(db, 'bookings/' + booking.id, booking); }
  catch (error) { await release(db, booking); throw error; }
  return r.json(201, { id: booking.id, status: 'requested', expert: booking.expert });
});
