const r = require('../lib/runtime');
const { claimRequest, ensureBooking, reserve, release } = require('../lib/bookings');
exports.handler = r.wrap(async event => {
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const db = r.store(event);
  await r.rateLimit(db, event, 'booking', 10);
  const booking = await claimRequest(db, r.parse(event), 'onsite');
  const existing = await ensureBooking(db, booking);
  if (existing.holds) return r.json(200, { id: existing.id, status: 'requested', expert: existing.expert });
  await reserve(db, booking);
  try {
    await r.privateUpdate(db, 'bookings/' + booking.id, value => ({ ...value, expert: booking.expert, holds: booking.holds }));
  } catch (error) {
    await release(db, booking);
    throw error;
  }
  return r.json(201, { id: booking.id, status: 'requested', expert: booking.expert });
});
