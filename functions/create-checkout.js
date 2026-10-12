const Stripe = require('stripe');
const r = require('../lib/runtime');
const { prepare } = require('../lib/bookings');
exports.handler = r.wrap(async event => {
  if (event.httpMethod !== 'POST') r.fail(405, 'Méthode non autorisée.');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!/^(sk|rk)_(test|live)_/.test(key || '')) r.fail(503, 'Paiement en ligne indisponible. Choisissez le règlement sur place.');
  if (!/^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || '')) r.fail(503, 'Confirmation de paiement non configurée. Choisissez le règlement sur place.');
  const db = r.store(event);
  await r.rateLimit(db, event, 'booking', 10);
  const booking = await prepare(db, r.parse(event));
  await r.privateSet(db, 'bookings/' + booking.id, booking);
  const stripe = new Stripe(key);
  const base = r.origin();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', customer_email: booking.email,
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(booking.acompte * 100), product_data: { name: 'Acompte — ' + booking.soin } } }],
    metadata: { booking_id: booking.id },
    success_url: base + '/?session_id={CHECKOUT_SESSION_ID}&booking=' + booking.id + '&token=' + booking.token + '#reserver',
    cancel_url: base + '/?cancel=1#reserver', locale: 'fr'
  }, { idempotencyKey: booking.id });
  booking.sessionId = session.id;
  await r.privateSet(db, 'bookings/' + booking.id, booking);
  return r.json(200, { url: session.url, id: session.id });
});
