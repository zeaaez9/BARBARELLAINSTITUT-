/**
 * Netlify Function — Stripe Checkout (acomptes Institut Barbarella)
 * Env: STRIPE_SECRET_KEY
 */
const Stripe = require('stripe');
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
function errBody(message, code, type, status) {
  return { statusCode: status || 400, headers, body: JSON.stringify({ error: message, code: code || 'request_error', type: type || 'invalid_request' }) };
}
function mapStripeError(err) {
  const code = err.code || err.type || 'stripe_error';
  const type = err.type || 'api_error';
  const raw = err.message || 'Erreur Stripe inconnue';
  if (/invalid api key|invalid_api_key|no api key/i.test(raw)) {
    return { message: 'Clé secrète Stripe invalide. Vérifiez STRIPE_SECRET_KEY sur Netlify.', code: 'invalid_api_key', type: 'authentication_error', status: 401 };
  }
  if (/test mode|live mode/i.test(raw)) {
    return { message: 'Incohérence mode Test / Live. Utilisez sk_test_ avec pk_test_.', code: 'mode_mismatch', type: 'invalid_request_error', status: 400 };
  }
  const map = {
    amount_too_small: 'Montant trop faible (minimum 0,50 €).',
    amount_too_large: 'Montant trop élevé.',
    card_declined: 'Carte refusée.',
    rate_limit: 'Trop de requêtes. Réessayez.'
  };
  return { message: map[code] || raw, code, type, status: err.statusCode && err.statusCode >= 400 ? err.statusCode : 502 };
}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return errBody('Méthode non autorisée', 'method_not_allowed', 'invalid_request', 405);
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return errBody('STRIPE_SECRET_KEY manquante sur Netlify.', 'missing_secret', 'configuration_error', 500);
  if (!secret.startsWith('sk_test_') && !secret.startsWith('sk_live_')) {
    return errBody('Clé secrète invalide (sk_test_ ou sk_live_).', 'invalid_secret_format', 'configuration_error', 500);
  }
  let data;
  try { data = JSON.parse(event.body || '{}'); } catch (e) {
    return errBody('JSON invalide.', 'invalid_json', 'invalid_request', 400);
  }
  const amount = parseInt(data.amount, 10);
  if (!Number.isFinite(amount) || amount < 50) {
    return errBody('Montant invalide (min 0,50 €).', 'amount_too_small', 'invalid_request', 400);
  }
  const currency = (data.currency || 'eur').toLowerCase();
  const successUrl = data.success_url;
  const cancelUrl = data.cancel_url;
  if (!successUrl || !cancelUrl) return errBody('success_url et cancel_url obligatoires.', 'missing_urls', 'invalid_request', 400);
  try {
    const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: data.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: data.soin ? 'Acompte — ' + data.soin : 'Acompte réservation',
            description: data.description || 'Institut Barbarella — acompte de confirmation'
          }
        }
      }],
      metadata: {
        client_name: (data.name || '').slice(0, 500),
        client_email: (data.email || '').slice(0, 500),
        client_tel: (data.tel || '').slice(0, 100),
        soin: (data.soin || '').slice(0, 500),
        institut: 'Institut Barbarella'
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'fr'
    });
    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, id: session.id }) };
  } catch (err) {
    console.error('Stripe create-checkout error:', err.type, err.code, err.message);
    const mapped = mapStripeError(err);
    return errBody(mapped.message, mapped.code, mapped.type, mapped.status);
  }
};
