'use strict';
const publicFields = ['services', 'categoriesEnabled', 'team', 'news', 'promo', 'waLinks'];
const privateFields = ['clients', 'aiAgents', 'stockData', 'stockSeuils', 'invHistory', 'lastInventaire', 'invConfig'];
let stateVersions = {}, sharedReady = false, saveQueue = Promise.resolve(), proRefresh = null;
function escapeHTML(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&', '<': '<', '>': '>', '\"': '"', "'": '&#39;' }[c])); }
async function api(path, method = 'GET', body) {
  const response = await fetch('/.netlify/functions/' + path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let data;
  try { data = await response.json(); } catch { throw new Error('Le serveur ne répond pas correctement.'); }
  if (!response.ok) {
    if (response.status === 401 && currentUser) { currentUser = null; clearInterval(proRefresh); openPro(); }
    throw new Error(data.error || 'Action impossible.');
  }
  return data;
}
function stateSnapshot() { return { services, categoriesEnabled, team, news, promo, waLinks, clients, aiAgents, stockData, stockSeuils, invHistory, lastInventaire, invConfig }; }
function applyState(state) {
  if (Array.isArray(state.services)) services = state.services;
  if (state.categoriesEnabled) categoriesEnabled = state.categoriesEnabled;
  if (Array.isArray(state.team)) team = state.team;
  if (Array.isArray(state.news)) news = state.news;
  if (Object.hasOwn(state, 'promo')) promo = state.promo;
  if (state.waLinks) waLinks = state.waLinks;
  if (Array.isArray(state.clients)) clients = state.clients;
  if (Array.isArray(state.aiAgents)) aiAgents = state.aiAgents;
  if (state.stockData) stockData = state.stockData;
  if (state.stockSeuils) stockSeuils = state.stockSeuils;
  if (Array.isArray(state.invHistory)) invHistory = state.invHistory;
  if (Object.hasOwn(state, 'lastInventaire')) lastInventaire = state.lastInventaire;
  if (state.invConfig) invConfig = state.invConfig;
  selService = services.find(s => s.name === selService?.name) || services[0];
}
function syncLabel(label) { const el = document.getElementById('sync-status'); if (el) el.textContent = label; }
async function refreshPublic() {
  const expert = document.getElementById('ms').value;
  const data = await api('site-state');
  applyState(data.state); stateVersions = { ...stateVersions, ...data.versions };
  sharedReady = data.configured;
  stripeConfig = { ...stripeConfig, enabled: data.payments.enabled, mode: data.payments.mode, proxy: location.origin + '/.netlify/functions/create-checkout' };
  renderPublic(); renderBookCats(); applyWaLink();
  document.getElementById('ms').value = expert;
}
async function refreshPro() {
  const data = await api('site-state?scope=pro');
  applyState(data.state); stateVersions = { ...stateVersions, ...data.versions };
  resas = (data.bookings || []).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  users = data.users;
  for (const booking of resas) if (!clients.some(c => c.email === booking.email)) clients.push({ id: booking.id, name: booking.client, email: booking.email, tel: booking.tel, visits: 0, total: 0, tag: 'Nouveau' });
  renderAllPro(); renderStats(); syncLabel('Données synchronisées');
}
async function persistField(field, value) {
  const data = await api('site-state', 'PUT', { field, value, version: stateVersions[field] ?? null });
  stateVersions[field] = data.version;
}
async function doLogin() {
  try {
    const data = await api('auth', 'POST', { login: document.getElementById('login-user').value.trim().toLowerCase(), password: document.getElementById('login-pass').value });
    currentUser = data.user; document.getElementById('login-pass').value = '';
    await refreshPublic(); await refreshPro();
    document.getElementById('login-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden');
    buildSide(); goView('dash');
    clearInterval(proRefresh);
    proRefresh = setInterval(() => { if (currentUser && document.getElementById('admin').style.display === 'block') refreshPro().catch(() => syncLabel('Synchronisation à réessayer')); }, 60000);
  } catch (error) { currentUser = null; alert(error.message); }
}
async function logout() {
  try { await api('auth', 'DELETE'); } catch (error) { alert(error.message); return; }
  currentUser = null; clients = []; users = []; resas = []; feed = []; clearInterval(proRefresh);
  document.getElementById('app-view').classList.add('hidden'); document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('login-user').value = ''; document.getElementById('login-pass').value = '';
}
const originalGoView = goView;
goView = function (id) {
  if (!currentUser || !(roleMenus[currentUser.role] || []).includes(id)) { alert('Accès non autorisé.'); return; }
  originalGoView(id);
};
window.showView = goView;
async function publishSite() {
  if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) { alert('Accès non autorisé.'); return; }
  try {
    if (!sharedReady) { const state = stateSnapshot(); for (const field of publicFields) await persistField(field, state[field]); sharedReady = true; }
    await refreshPublic(); await refreshPro();
    alert('Le catalogue et le site public sont synchronisés pour tous les visiteurs.');
  } catch (error) { alert(error.message); }
}
function renderStats() {
  const paid = resas.filter(r => r.st === 'paid' && r.paymentMode === 'live');
  const total = paid.reduce((sum, r) => sum + r.acompte, 0);
  document.getElementById('live-stats').innerHTML = [ ['Acomptes encaissés (Live)', total.toFixed(2) + ' €'], ['Paiements Live', paid.length], ['Demandes reçues', resas.length], ['Créneaux à valider', resas.filter(r => r.bookingStatus === 'requested').length] ].map(([label, value]) => '<div class="stat"><span>' + label + '</span><b>' + value + '</b></div>').join('');
}
function renderRealAgenda() {
  const bookings = resas.filter(r => r.date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  document.getElementById('agenda').innerHTML = bookings.map(r => '<div class="aday"><h5>' + escapeHTML(r.date + ' · ' + r.time) + '</h5><div class="slot">' + escapeHTML(r.client) + '</div><div>' + escapeHTML(r.expert) + '</div><div>' + escapeHTML(r.soin) + '</div><small>' + (r.st === 'paid' ? 'Acompte vérifié' : 'Sans paiement en ligne') + ' · créneau retenu</small></div>').join('') || '<p>Aucune demande de rendez-vous enregistrée.</p>';
}
function showBookingResult(text) {
  document.getElementById('book-form').classList.add('hidden'); document.getElementById('sum-box').classList.add('hidden');
  const box = document.getElementById('book-ok'); box.classList.remove('hidden'); box.querySelector('p').textContent = text;
}
function getRequestId() {
  let id = sessionStorage.getItem('bb_requestId');
  if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    id = crypto.randomUUID();
    sessionStorage.setItem('bb_requestId', id);
  }
  return id;
}
document.getElementById('book-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('pay-btn'); button.disabled = true; button.textContent = 'Enregistrement…';
  try {
    await refreshPublic();
    if (!sharedReady) throw new Error('La réservation sera disponible après validation du catalogue par l’institut. Contactez-nous par téléphone.');
    if (!selService || selService.cat === 'produits') throw new Error('Les produits sont disponibles sur place. Sélectionnez un soin pour un rendez-vous.');
    const index = services.findIndex(s => s.name === selService.name);
    const payload = {
      requestId: getRequestId(),
      name: document.getElementById('fn').value.trim() + ' ' + document.getElementById('ln').value.trim(),
      email: document.getElementById('em').value.trim().toLowerCase(),
      tel: document.getElementById('ph').value.trim(),
      soin: selService.name,
      date: document.getElementById('dt').value,
      time: document.getElementById('booking-time').value,
      expert: document.getElementById('ms').value,
      duration: prestSel[index] || selService.chosenDur || '60'
    };
    if (document.querySelector('input[name="pay"]:checked').value === 'card' && getDeposit(selService) > 0) {
      const data = await api('create-checkout', 'POST', payload);
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Adresse de paiement invalide.');
      sessionStorage.removeItem('bb_requestId'); // nouvelle tentative après succès
      location.assign(url.href);
    } else {
      await api('reservations', 'POST', payload);
      sessionStorage.removeItem('bb_requestId');
      showBookingResult('Votre demande est enregistrée et le créneau est retenu. L’institut vous contactera pour confirmer ; le paiement se fera sur place.');
    }
  } catch (error) { alert(error.message); }
  finally {
    button.disabled = false;
    const deposit = typeof getDeposit === 'function' ? getDeposit(selService) : 0;
    const onsite = document.querySelector('input[name="pay"]:checked')?.value === 'onsite';
    button.textContent = typeof payLabel === 'function' ? payLabel(selService && selService.cat, deposit, onsite) : 'Payer l’acompte';
  }
});
async function handleStripeReturn() {
  const params = new URLSearchParams(location.search);
  if (params.has('session_id')) {
    const request = Object.fromEntries(['session_id', 'booking', 'token'].map(key => [key, params.get(key)]));
    history.replaceState({}, '', location.pathname + '#reserver');
    try {
      const result = await api('checkout-status', 'POST', request);
      if (!result.paid) throw new Error('Paiement encore en attente. Contactez l’institut avant de réessayer.');
      showBookingResult(result.test ? 'Paiement de test vérifié : aucun montant réel encaissé. Le créneau est retenu.' : 'Acompte vérifié et créneau retenu. L’institut vous contactera pour confirmer.');
    } catch (error) { alert(error.message); }
  } else if (params.get('paid') === '1') {
    history.replaceState({}, '', location.pathname + '#reserver');
    alert('Ce lien ne constitue pas une preuve de paiement. Contactez l’institut si vous avez déjà réglé un acompte.');
  } else if (params.get('cancel') === '1') {
    history.replaceState({}, '', location.pathname + '#reserver'); alert('Paiement annulé. Aucun paiement confirmé.');
  }
}
function applyLoyalty() {
  activeLoyalty = { tag: 'Nouveau', discount: 0 };
  const el = document.getElementById('loyalty-msg'); el.style.display = 'block';
  el.textContent = 'Les avantages fidélité seront validés par l’institut lors de votre rendez-vous.'; updateLoyaltyPrice();
}
function openClientSpace() {
  document.getElementById('client-space').classList.remove('hidden');
  document.getElementById('client-space-info').textContent = 'Pour protéger vos informations, le suivi personnalisé est disponible auprès de l’institut. Une connexion client sécurisée sera nécessaire pour ouvrir cet espace.';
  document.getElementById('client-space-tarifs').textContent = '';
}
function addBot(text) { appendMessage('bot', text); }
function addUser(text) { appendMessage('user', text); }
function appendMessage(role, text) {
  const message = document.createElement('div'); message.className = 'msg ' + role; message.textContent = text;
  const box = document.getElementById('chat-body'); box.appendChild(message); box.scrollTop = box.scrollHeight;
}
let chatPending = false;
async function sendChat() {
  if (chatPending) return;
  const input = document.getElementById('chat-in'), message = input.value.trim();
  if (!message || message.length > 2000) return;
  chatPending = true; addUser(message); input.value = '';
  try { const data = await api('agent-chat', 'POST', { message, lang: chatLangCode }); addBot(data.reply); }
  catch { addBot(replyAI(message)); }
  finally { chatPending = false; }
}
async function runAiAction() {
  const agent = aiAgents.find(a => a.id === editAiId);
  if (!agent || agent.status !== 'active') { alert('Activez cet agent avant de le lancer.'); return; }
  const out = document.getElementById('ai-action-out'); out.textContent = 'Génération…';
  try { const data = await api('agent-run', 'POST', { agentName: agent.name, prompt: agent.prompt, action: agent.action }); out.textContent = data.text; }
  catch (error) { out.textContent = 'Agent indisponible : ' + error.message; }
}
async function saveUserForm() {
  if (!currentUser || currentUser.role !== 'admin') { alert('Seul un administrateur peut gérer les accès.'); return; }
  const password = document.getElementById('u-pass').value;
  if (password !== document.getElementById('u-pass2').value) { alert('Mots de passe différents.'); return; }
  if (password && password.length < 8) { alert('Mot de passe : 8 caractères minimum.'); return; }
  try { await api('users', 'POST', { id: editUserId, login: document.getElementById('u-login').value, name: document.getElementById('u-name').value, role: document.getElementById('u-role').value, password }); await refreshPro(); closeUserForm(); alert('Accès enregistré côté serveur.'); }
  catch (error) { alert(error.message); }
}
async function delUser(id) {
  if (!confirm('Supprimer cet accès ?')) return;
  try { await api('users', 'DELETE', { id }); await refreshPro(); } catch (error) { alert(error.message); }
}
function resetLocalCache() {
  if (!confirm('Effacer uniquement le cache public de ce navigateur ? Les données serveur restent conservées.')) return;
  ['bb_svc_v7', 'bb_cats_v2', 'bb_team_v5', 'bb_news_v5', 'bb_promo_v5', 'bb_wa_v3', 'bb_stripe_v1'].forEach(key => localStorage.removeItem(key));
  location.reload();
}
function saveStripeConfig() { alert('Le paiement est configuré sur Netlify avec STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET. Aucune clé secrète ne doit être saisie ici.'); }
function saveSmsConfig() { alert('Les SMS automatiques nécessitent une intégration serveur. Aucun message n’est envoyé actuellement.'); }
function testSmsSend() { saveSmsConfig(); }
function queueSms() { return false; }
function runLoyalty() { alert('Aucune campagne envoyée. L’envoi nécessitera un fournisseur de messagerie connecté et les consentements clients.'); }
const mutations = { saveServices: 'catalog', saveCategories: 'catalog', publishPromo: 'promos', clearPromo: 'promos', saveNewsForm: 'news', delNews: 'news', saveClientForm: 'clients', saveSeuilsAlerte: 'inventaire', validerInventaire: 'inventaire', toggleMasseuse: 'team', saveAiForm: 'ai', saveWaLink: 'admin' };
for (const [name, view] of Object.entries(mutations)) {
  const original = window[name];
  window[name] = function (...args) {
    if (!currentUser || !roleMenus[currentUser.role]?.includes(view)) { alert('Accès non autorisé.'); return Promise.resolve(); }
    saveQueue = saveQueue.then(async () => {
      const before = JSON.parse(JSON.stringify(stateSnapshot()));
      const messages = [], savedAlert = window.alert;
      window.alert = message => messages.push(message);
      try { original(...args); } finally { window.alert = savedAlert; }
      const after = stateSnapshot();
      const changed = publicFields.concat(privateFields).filter(field => JSON.stringify(after[field]) !== JSON.stringify(before[field]));
      if (!changed.length) { messages.forEach(savedAlert); return; }
      syncLabel('Enregistrement…');
      try {
        for (const field of changed) await persistField(field, after[field]);
        renderPublic(); renderAllPro(); renderStats(); syncLabel('Données synchronisées');
        savedAlert('Modifications enregistrées pour tous les appareils.');
      } catch (error) {
        applyState(before); renderPublic(); renderAllPro(); syncLabel('Enregistrement échoué'); savedAlert(error.message);
      }
    }).catch(error => { syncLabel('Enregistrement échoué'); alert(error.message); });
    return saveQueue;
  };
}
saveProfileForm = async function () {
  if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) { alert('Accès non autorisé.'); return; }
  const oldTeam = JSON.parse(JSON.stringify(team));
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { alert('Nom obligatoire.'); return; }
  try {
    const file = document.getElementById('pf-file')?.files?.[0];
    let photo = document.getElementById('pf-photo').value.trim() || team.find(t => t.id === editProfId)?.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800';
    if (file) {
      if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Photo PNG, JPEG ou WebP de 2 Mo maximum.');
      photo = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Lecture de photo impossible.')); reader.readAsDataURL(file); });
    }
    const data = { id: editProfId || Date.now(), name, role: document.getElementById('pf-role').value.trim() || 'Experte', desc: document.getElementById('pf-desc').value.trim(), visible: document.getElementById('pf-visible').value === '1', photo };
    const next = team.some(t => t.id === data.id) ? team.map(t => t.id === data.id ? data : t) : [...team, data];
    await persistField('team', next); team = next;
    renderPublic(); renderAllPro(); closeProfileForm(); alert('Profil enregistré pour tous les visiteurs.');
  } catch (error) { team = oldTeam; renderPublic(); renderAllPro(); alert(error.message); }
};
document.getElementById('dt').min = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
document.getElementById('login-pass').addEventListener('keydown', event => { if (event.key === 'Enter') doLogin(); });
refreshPublic().catch(() => { sharedReady = false; });
handleStripeReturn();
