const r = require('../lib/runtime');
const { claimRequest, ensureBooking } = require('../lib/bookings');
exports.handler = r.wrap(async event => {
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const db = r.store(event);
  await r.rateLimit(db, event, 'booking', 10);
  const booking = await claimRequest(db, r.parse(event), 'onsite');
  await ensureBooking(db, booking);
  return r.json(201, { id: booking.id, status: 'requested' });
});
