/**
 * Netlify Function — Exécution agents Dashboard (Grok / xAI)
 * POST { agentName, prompt, action, context? }
 * → { text }
 */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const ACTION_HINTS = {
  mkt: 'Génère 3 textes courts (Instagram / WhatsApp Communauté) pour l’Institut Barbarella, ton élégant et feutré, hashtags discrets. Français.',
  invoice: 'Propose des libellés de facture prestataire sobres : « Honoraires prestation bien-être ». Pas de détail client explicite. Liste 3 exemples.',
  maintain: 'Check-list santé pour un institut beauté en ligne : site, réservations, Stripe, stocks, accès. Réponds en puces courtes FR.',
  test: 'Réponds en une phrase que tu es l’agent actif de l’Institut Barbarella, ton discret.'
};

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
      body: JSON.stringify({ error: 'XAI_API_KEY manquante', text: null, fallback: true })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const action = body.action || 'test';
  const agentPrompt = body.prompt || '';
  const agentName = body.agentName || 'Agent';
  const hint = ACTION_HINTS[action] || ACTION_HINTS.test;
  const model = process.env.GROK_MODEL || 'grok-3-mini';

  const system = `Tu es « ${agentName} » pour l’Institut Barbarella (Paris, beauté & bien-être, sensualité raffinée).
${agentPrompt}
Règles : français, élégant, jamais vulgaire, jamais de données clients inventées.`;

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: hint + (body.context ? '\n\nContexte : ' + body.context : '') }
        ],
        temperature: 0.7,
        max_tokens: 600
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('agent-run xAI', res.status, data);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'Erreur Grok', text: null, fallback: true })
      };
    }
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return { statusCode: 200, headers, body: JSON.stringify({ text, model }) };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, text: null, fallback: true })
    };
  }
};
