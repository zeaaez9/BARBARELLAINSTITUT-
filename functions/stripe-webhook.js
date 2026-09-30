/**
 * Netlify Function — Webhook Stripe
 *
 * Env :
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET = whsec_...
 *
 * URL Stripe Dashboard :
 *   https://TON-SITE.netlify.app/.netlify/functions/stripe-webhook
 */

const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('Webhook: STRIPE_SECRET_KEY manquante');
    return { statusCode: 500, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY manquante' }) };
  }
  if (!webhookSecret) {
    console.error('Webhook: STRIPE_WEBHOOK_SECRET manquante');
    return { statusCode: 500, body: JSON.stringify({ error: 'STRIPE_WEBHOOK_SECRET manquante — ajoutez whsec_… dans Netlify puis redeploy' }) };
  }
  if (!webhookSecret.startsWith('whsec_')) {
    console.error('Webhook: STRIPE_WEBHOOK_SECRET format invalide');
    return { statusCode: 500, body: JSON.stringify({ error: 'STRIPE_WEBHOOK_SECRET doit commencer par whsec_' }) };
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  if (!sig) {
    console.error('Webhook: en-tête Stripe-Signature absent');
    return { statusCode: 400, body: JSON.stringify({ error: 'Signature Stripe absente' }) };
  }

  let stripeEvent;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature invalide:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Signature webhook invalide',
        detail: err.message,
        hint: 'Vérifiez STRIPE_WEBHOOK_SECRET (Test vs Live) et que le body n’est pas modifié'
      })
    };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const meta = session.metadata || {};
        const info = {
          sessionId: session.id,
          amount: session.amount_total,
          currency: session.currency,
          email: session.customer_email || meta.client_email,
          name: meta.client_name,
          soin: meta.soin,
          tel: meta.client_tel,
          paymentStatus: session.payment_status
        };
        if (session.payment_status === 'paid') {
          console.log('✓ Acompte payé', info);
        } else {
          console.log('⚠ Session completed mais payment_status =', session.payment_status, info);
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = stripeEvent.data.object;
        console.log('○ Session Checkout expirée', {
          sessionId: session.id,
          email: session.customer_email
        });
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = stripeEvent.data.object;
        const lastErr = pi.last_payment_error || {};
        console.log('✗ Paiement échoué', {
          id: pi.id,
          code: lastErr.code,
          decline_code: lastErr.decline_code,
          message: lastErr.message
        });
        break;
      }
      default:
        console.log('Événement non géré:', stripeEvent.type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  } catch (err) {
    console.error('Erreur traitement webhook:', err);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: err.message }) };
  }
};
