const Stripe = require('stripe');
const r = require('../lib/runtime');
const { recordPayment } = require('../lib/bookings');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return r.json(405, { error: 'Méthode non autorisée.' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return r.json(503, { error: 'Webhook non configuré.' });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let notification;
  try {
    notification = stripe.webhooks.constructEvent(event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body, event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return r.json(400, { error: 'Signature invalide.' }); }
  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(notification.type) && notification.data.object.metadata?.booking_id) {
      await recordPayment(r.store(event), notification.data.object);
    }
    return r.json(200, { received: true });
  } catch (error) {
    console.error('Webhook storage failure:', error.name);
    return r.json(500, { error: 'Traitement à réessayer.' });
  }
};
