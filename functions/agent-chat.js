/**
 * Netlify Function — Agent chat Grok (xAI)
 * Institut Barbarella — accueil site
 *
 * Env Netlify :
 *   XAI_API_KEY   = clé API xAI (console.x.ai)
 *   GROK_MODEL    = optionnel, défaut grok-3-mini
 *
 * POST JSON : { message, lang?, history? }
 * Réponse : { reply }
 */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const SYSTEM_FR = `Tu es l'assistante d'accueil de l'Institut Barbarella (Paris République, 58 rue Notre Dame de Nazareth, 75003).
Horaires : tous les jours 11h–20h. Tél : 01 43 31 53 00.

Cadre : beauté, bien-être, sensualité raffinée et discrète. Jamais vulgaire, jamais explicite.

Prestations :
- Massages (Iris, Aphrodisiaque, sur mesure…)
- Épilation à la cire orientale
- Manucure & pédicure (si section active)
- Produits dérivés (huiles, bougies, savons, cires, diffuseurs)

Acomptes de confirmation en ligne :
- Massages : 29,99 €
- Épilation : 4,99 € (intégrales 29,99 €)
- Manucure : 9,99 €
- Produits : paiement sur place

Fidélité : Fidèle −10 %, VIP −15 % (Espace client sur le site).

Tu orientes vers la section « Réserver » pour prendre RDV.
Pour une réclamation : empathie, proposes le canal WhatsApp Réclamations, et dis qu'un manager recontacte sous 24 h.
Réponses courtes (2–5 phrases), en français élégant sauf si le client écrit dans une autre langue.
Si tu ne sais pas : propose de laisser un email ou d'appeler.`;

const SYSTEM_EN = `You are the front-desk assistant for Institut Barbarella (Paris République).
Hours: daily 11am–8pm. Elegant, discreet wellness & refined sensuality — never vulgar.
Deposits: massages €29.99 · waxing €4.99 (full €29.99) · manicure €9.99.
Guide guests to the Reserve section. Complaints: empathy + manager within 24h.
Short answers (2–5 sentences).`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'XAI_API_KEY manquante',
        reply: null,
        fallback: true
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const message = (body.message || '').trim();
  if (!message || message.length > 2000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'message invalide' }) };
  }

  const lang = (body.lang || 'fr').toLowerCase();
  const system = lang === 'fr' ? SYSTEM_FR : SYSTEM_EN;
  const model = process.env.GROK_MODEL || 'grok-3-mini';

  const messages = [{ role: 'system', content: system }];
  if (Array.isArray(body.history)) {
    body.history.slice(-8).forEach((h) => {
      if (h && (h.role === 'user' || h.role === 'assistant') && h.content) {
        messages.push({ role: h.role, content: String(h.content).slice(0, 1500) });
      }
    });
  }
  messages.push({ role: 'user', content: message });

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.55,
        max_tokens: 450
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('xAI error', res.status, data);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: data.error?.message || 'Erreur API Grok',
          reply: null,
          fallback: true
        })
      };
    }

    const reply =
      data.choices?.[0]?.message?.content?.trim() ||
      'Je transmets votre message à l’équipe.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply, model })
    };
  } catch (err) {
    console.error('agent-chat', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        reply: null,
        fallback: true
      })
    };
  }
};
