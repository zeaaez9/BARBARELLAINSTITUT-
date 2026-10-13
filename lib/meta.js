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
      for (const message of change.value?.messages || []) items.push({ channel: 'whatsapp', id: message.id, to: message.from });
    }
    for (const message of entry.messaging || []) {
      if (message.message && !message.message.is_echo) items.push({ channel: 'instagram', id: message.message.mid, to: message.sender?.id });
    }
  }
  return items.filter(item => typeof item.id === 'string' && typeof item.to === 'string');
}
async function deliver(item) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (item.channel === 'whatsapp') {
    const phoneId = process.env.META_PHONE_NUMBER_ID;
    const to = item.to.replace(/[^\d]/g, '');
    if (!token || !/^\d+$/.test(phoneId) || to.length < 8) return false;
    const response = await fetch('https://graph.facebook.com/v21.0/' + phoneId + '/messages', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: REPLY } }),
      signal: AbortSignal.timeout(8000)
    });
    return response.ok;
  }
  const instagramId = process.env.META_INSTAGRAM_ID;
  if (!token || !/^\d+$/.test(instagramId || '') || !/^\d+$/.test(item.to)) return false;
  const response = await fetch('https://graph.facebook.com/v21.0/' + instagramId + '/messages', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: item.to }, message: { text: REPLY } }),
    signal: AbortSignal.timeout(8000)
  });
  return response.ok;
}
async function replyAll(db, payload) {
  for (const item of incoming(payload)) {
    const key = 'meta/seen/' + item.channel + '/' + item.id.slice(0, 180);
    const saved = await db.setJSON(key, { at: Date.now() }, { onlyIfNew: true });
    if (!saved.modified) continue;
    try {
      if (!await deliver(item)) await db.delete(key);
    } catch (error) {
      await db.delete(key);
      throw error;
    }
  }
}
module.exports = { same, rawBody, signed, incoming, replyAll };