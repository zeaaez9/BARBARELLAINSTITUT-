const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/frontend.cjs');
test('page and server integration initialize without script errors', async () => {
  const h = await harness(); assert.ok(h.document.getElementById('prest-detail').innerHTML); assert.ok(h.requests.some(r => r.url.endsWith('/site-state')));
  assert.equal(h.document.querySelector('#cc'), null); assert.equal(h.run('users.length'), 0); assert.equal(h.run('clients.length'), 0);
});
test('all eleven admin tabs and role restrictions work', async () => {
  const h = await harness(); h.run("currentUser={id:1,name:'Admin',role:'admin'};buildSide();renderAllPro();renderStats()");
  for (const tab of ['dash', 'agenda', 'catalog', 'inventaire', 'promos', 'news', 'clients', 'team', 'roles', 'ai', 'admin']) { h.run("goView('" + tab + "')"); assert.ok(!h.document.getElementById('view-' + tab).classList.contains('hidden')); }
  h.run("currentUser={role:'employee'};goView('admin')"); assert.match(h.alerts.at(-1), /non autorisé/);
  assert.match(h.document.getElementById('agenda').textContent, /Aucune demande/); assert.ok(!h.document.getElementById('live-stats').textContent.includes('1 240'));
});
test('public prestation and booking tabs switch correctly', async () => {
  const h = await harness();
  for (const cat of ['massage', 'epilation', 'manucure', 'produits']) { h.run("switchCat('" + cat + "');switchBookCat('" + cat + "')"); assert.equal(h.run('currentCat'), cat); assert.equal(h.run('bookCat'), cat); }
  h.run("showPrestByGlobalIdx(6);switchSurMesureTab('comp')"); assert.ok(!h.document.getElementById('sm-panel-comp').classList.contains('hidden'));
});
test('catalog refresh preserves selected care, duration and expert', async () => {
  const h = await harness(); h.run("selectPkg(2,document.querySelector('.pkg[data-idx=\"2\"]'),'30')");
  h.document.getElementById('ms').value = 'Déesse Farah';
  await h.run('refreshPublic()');
  assert.equal(h.run('selService.name'), 'Massage Aphrodisiaque'); assert.equal(h.run('prestSel[2]'), '30'); assert.equal(h.document.getElementById('ms').value, 'Déesse Farah');
});
test('forged paid query never confirms a payment', async () => {
  const h = await harness('?paid=1'); assert.ok(h.alerts.some(x => /preuve de paiement/.test(x))); assert.ok(h.document.getElementById('book-ok').classList.contains('hidden'));
});
test('Stripe return verified server-side and test mode disclosed', async () => {
  const h = await harness('?session_id=cs_test_verified&booking=uuid&token=secret'); assert.ok(h.requests.some(r => r.url.endsWith('/checkout-status') && r.body.token === 'secret')); assert.match(h.document.getElementById('book-ok').textContent, /aucun montant réel/);
});
test('chat text rendered without HTML injection', async () => {
  const h = await harness(); h.run("addUser('<img src=x onerror=alert(1)>')"); assert.equal(h.document.querySelector('#chat-body img'), null); assert.match(h.document.getElementById('chat-body').textContent, /<img/);
});
test('catalog mutation persists to backend and does not claim local-only success', async () => {
  const h = await harness(); h.run("currentUser={role:'admin'}"); h.document.getElementById('pr-title').value = 'Offre nouvelle'; h.document.getElementById('pr-desc').value = 'Texte';
  await h.run('publishPromo()'); const request = h.requests.find(r => r.method === 'PUT' && r.body.field === 'promo'); assert.equal(request.body.value.title, 'Offre nouvelle'); assert.ok(h.alerts.some(x => /tous les appareils/.test(x)));
});
test('editing a service sends its new price to the server and survives refresh', async () => {
  const h = await harness(); h.run("currentUser={id:1,role:'admin'};openServiceForm(0)"); h.document.getElementById('svc-price').value = '181';
  await h.run('saveServiceForm()');
  const writes = h.requests.filter(r => r.method === 'PUT'); assert.equal(writes.length, 1); assert.equal(writes[0].body.field, 'services'); assert.equal(writes[0].body.value[0].price, 181);
  await h.run('refreshPublic()'); assert.equal(h.run('services[0].price'), 181);
});
test('creating and deleting services persist through real form entry points', async () => {
  const h = await harness(); h.run("currentUser={id:1,role:'admin'};openServiceForm(null)");
  h.document.getElementById('svc-name').value = 'Nouveau soin'; h.document.getElementById('svc-price').value = '50';
  await h.run('saveServiceForm()'); assert.ok(h.serverState.services.some(s => s.name === 'Nouveau soin'));
  await h.run("delService(services.findIndex(s=>s.name==='Nouveau soin'))"); assert.ok(!h.serverState.services.some(s => s.name === 'Nouveau soin'));
});
test('category visibility persists across server refresh', async () => {
  const h = await harness(); h.run("currentUser={role:'admin'}"); await h.run("toggleCategory('massage',false)");
  assert.equal(h.serverState.categoriesEnabled.massage, false); await h.run('refreshPublic()'); assert.equal(h.run('categoriesEnabled.massage'), false);
});
test('failed catalog save rolls back runtime and cached values without success notice', async () => {
  const h = await harness(); h.run("currentUser={role:'admin'};openServiceForm(0)"); h.document.getElementById('svc-price').value = '181';
  const original = h.context.fetch; h.context.fetch = async (url, opts = {}) => opts.method === 'PUT' ? { ok: false, status: 409, json: async () => ({ error: 'Conflit de version' }) } : original(url, opts);
  await h.run('saveServiceForm()'); assert.equal(h.run('services[0].price'), 180); assert.equal(JSON.parse(h.storage.get('bb_svc_v7'))[0].price, 180);
  assert.ok(h.alerts.includes('Conflit de version')); assert.ok(!h.alerts.some(message => /tous les appareils/.test(message)));
});
test('dashboard counts live payments only and labels test payments separately', async () => {
  const h = await harness(); h.run("resas=[{st:'paid',acompte:29.99,paymentMode:'live'},{st:'paid',acompte:299.99,paymentMode:'test'},{st:'paid',acompte:99}];renderStats()");
  const stats = h.document.getElementById('live-stats'); assert.match(stats.children[0].textContent, /29.99/); assert.match(stats.children[2].textContent, /test/); assert.equal(stats.children[2].querySelector('b').textContent, '1');
});
test('retry reference survives reload without storing customer details', async () => {
  const h = await harness(); const first = await h.run("requestIdFor({name:'Customer',email:'private@example.test',time:'15:00',payMethod:'card'})");
  h.run('pendingRequest=null'); const second = await h.run("requestIdFor({name:'Customer',email:'private@example.test',time:'15:00',payMethod:'card'})");
  assert.equal(first, second); assert.ok(!h.requestStorage.get('bb_booking_request_v2').includes('private@example.test'));
  assert.notEqual(await h.run("requestIdFor({name:'Customer',email:'private@example.test',time:'16:00',payMethod:'card'})"), first);
});
