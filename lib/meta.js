const crypto = require('node:crypto');
const REPLY = 'Institut Barbarella, Paris République. Votre message est bien reçu. Pour réserver : https://barbarella.netlify.app ou le 01 43 31 53 00. Ouvert tous les jours de 11 h à 20 h.';

function same(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function rawBody(event) {
  return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');
}
function signed(event) {
  const secret = process.env.META_APP_SECRET;
  const header = event.headers?.['x-hub-signature-256'] || event.headers?.['X-Hub-Signature-256'];
  if (!secret || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody(event)).digest('hex');
  return same(expected, header);
}
function incoming(payload) {
  const items = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '';
        items.push({ channel: 'whatsapp', id: message.id, to: message.from, text: String(text).slice(0, 1000) });
      }
    }
    for (const message of entry.messaging || []) {
      if (message.message && !message.message.is_echo) {
        items.push({ channel: 'instagram', id: message.message.mid, to: message.sender?.id, text: String(message.message.text || '').slice(0, 1000) });
      }
    }
  }
  return items.filter(item => typeof item.id === 'string' && typeof item.to === 'string');
}
async function answer(text) {
  const key = process.env.XAI_API_KEY;
  const clean = String(text || '').replace(/[<>]/g, '').trim().slice(0, 1000);
  if (!key || !clean) return REPLY;
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROK_MODEL || 'grok-3-mini',
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          { role: 'system', content: 'Tu es l’assistante de l’Institut Barbarella, 58 rue Notre Dame de Nazareth, 75003 Paris. Ouvert tous les jours de 11 h à 20 h. Téléphone 01 43 31 53 00, WhatsApp 06 67 64 36 15. Acomptes de confirmation : massages 29,99 €, épilation 4,99 € (intégrale 29,99 €), manucure 9,99 €. Pour réserver : https://barbarella.netlify.app. Ton élégant, jamais vulgaire. Deux à quatre phrases, dans la langue du client.' },
          { role: 'user', content: clean }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json().catch(() => ({}));
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply ? reply.slice(0, 900) : REPLY;
  } catch {
    return REPLY;
  }
}
function token() {
  return process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
}
function phoneId() {
  return process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
}
function instagramId() {
  return process.env.META_INSTAGRAM_ID || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '';
}
async function deliver(item, body) {
  const accessToken = token();
  const text = String(body || REPLY).slice(0, 1000);
  if (item.channel === 'whatsapp') {
    const id = phoneId();
    const to = item.to.replace(/[^\d]/g, '');
    if (!accessToken || !/^\d+$/.test(id) || to.length < 8) return false;
    const response = await fetch('https://graph.facebook.com/v21.0/' + id + '/messages', {
      method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: text } }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) console.error('WhatsApp reply', response.status);
    return response.ok;
  }
  const ig = instagramId();
  if (!accessToken || !/^\d+$/.test(ig || '') || !/^\d+$/.test(item.to)) return false;
  const response = await fetch('https://graph.facebook.com/v21.0/' + ig + '/messages', {
    method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: item.to }, message: { text } }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) console.error('Instagram reply', response.status);
  return response.ok;
}
async function replyAll(db, payload) {
  for (const item of incoming(payload)) {
    const key = 'meta/seen/' + item.channel + '/' + item.id.slice(0, 180);
    const saved = await db.setJSON(key, { at: Date.now() }, { onlyIfNew: true });
    if (!saved.modified) continue;
    try {
      const body = await answer(item.text);
      if (!await deliver(item, body)) await db.delete(key);
    } catch (error) {
      await db.delete(key);
      throw error;
    }
  }
}
module.exports = { same, rawBody, signed, incoming, replyAll };