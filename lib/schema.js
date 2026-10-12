const r = require('./runtime');
const categories = ['massage', 'epilation', 'manucure', 'produits'];
function invalid(field) { r.fail(400, 'Données invalides : ' + field + '.'); }
function object(value, fields, field, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)) || required.some(k => !Object.hasOwn(value, k))) invalid(field);
}
function string(value, field, max = 1000, required = false, attribute = false) {
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f]/.test(value) || required && !value.trim() || attribute && /['"`\\]/.test(value)) invalid(field);
}
function number(value, field, integer = false, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > 100000000 || integer && !Number.isSafeInteger(value)) invalid(field);
}
function boolean(value, field) { if (typeof value !== 'boolean') invalid(field); }
function id(value, field, uuid = false) {
  if (!(Number.isSafeInteger(value) && value > 0 || uuid && typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value))) invalid(field);
}
function list(value, field, validate, max = 2000) {
  if (!Array.isArray(value) || value.length > max) invalid(field);
  value.forEach(validate);
}
function optionalString(item, key, max = 1000, attribute = false) { if (Object.hasOwn(item, key)) string(item[key], key, max, false, attribute); }
function validate(field, value) {
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > 4000000) invalid(field);
  if (field === 'categoriesEnabled') {
    object(value, categories, field, categories); categories.forEach(k => boolean(value[k], k));
  } else if (field === 'services') {
    list(value, field, item => {
      object(item, ['name', 'cat', 'price', 'price30', 'dur', 'dur30', 'desc'], field, ['name', 'cat', 'price', 'dur', 'desc']);
      string(item.name, 'name', 200, true, true); if (!categories.includes(item.cat)) invalid('cat');
      number(item.price, 'price'); string(item.dur, 'dur', 100, true); string(item.desc, 'desc', 10000);
      if (item.price30 != null) number(item.price30, 'price30');
      if (item.dur30 != null) string(item.dur30, 'dur30', 100);
    });
    if (new Set(value.map(s => s.name)).size !== value.length) invalid('noms de prestations en double');
  } else if (field === 'team') {
    list(value, field, item => {
      object(item, ['id', 'name', 'role', 'desc', 'photo', 'visible'], field, ['id', 'name', 'role', 'desc', 'photo']);
      id(item.id, 'id'); string(item.name, 'name', 200, true, true); string(item.role, 'role', 200); string(item.desc, 'desc', 10000);
      string(item.photo, 'photo', 3000000, true, true);
      if (!(/^https:\/\//.test(item.photo) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.photo))) invalid('photo');
      if (item.visible !== undefined) boolean(item.visible, 'visible');
    }, 100);
  } else if (field === 'news') {
    list(value, field, item => {
      object(item, ['id', 'title', 'text'], field, ['id', 'title', 'text']);
      id(item.id, 'id'); string(item.title, 'title', 300, true); string(item.text, 'text', 10000);
    });
  } else if (field === 'promo') {
    if (value !== null) { object(value, ['title', 'desc'], field, ['title', 'desc']); string(value.title, 'title', 300, true); string(value.desc, 'desc', 10000); }
  } else if (field === 'waLinks') {
    object(value, ['a', 'b', 'c'], field, ['a', 'b', 'c']);
    Object.values(value).forEach(url => {
      string(url, field, 1000, true, true);
      if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\/[^\s]+$/.test(url)) invalid(field);
    });
  } else if (field === 'clients') {
    list(value, field, item => {
      object(item, ['id', 'name', 'email', 'tel', 'dob', 'last', 'total', 'visits', 'tag'], field, ['id', 'name', 'email', 'tag']);
      id(item.id, 'id', true); string(item.name, 'name', 200, true, true); string(item.email, 'email', 200, true, true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) invalid('email');
      optionalString(item, 'tel', 40); optionalString(item, 'dob', 10); optionalString(item, 'last', 100);
      if (item.dob && !/^\d{4}-\d{2}-\d{2}$/.test(item.dob)) invalid('dob');
      if (item.total !== undefined) number(item.total, 'total'); if (item.visits !== undefined) number(item.visits, 'visits', true);
      if (!['Nouveau', 'Fidèle', 'VIP'].includes(item.tag)) invalid('tag');
    }, 10000);
    if (new Set(value.map(c => c.email.toLowerCase())).size !== value.length) invalid('emails clients en double');
  } else if (field === 'aiAgents') {
    list(value, field, item => {
      object(item, ['id', 'name', 'status', 'langs', 'prompt', 'escalade', 'notes', 'action'], field, ['id', 'name', 'status', 'langs', 'prompt', 'escalade', 'action']);
      string(item.id, 'id', 100, true); if (!/^[a-z0-9_-]+$/.test(item.id)) invalid('id');
      string(item.name, 'name', 200, true); string(item.langs, 'langs', 200); string(item.prompt, 'prompt', 5000); boolean(item.escalade, 'escalade'); optionalString(item, 'notes', 5000);
      if (!['active', 'pause', 'setup'].includes(item.status) || !['test', 'mkt', 'invoice', 'maintain'].includes(item.action)) invalid(field);
    }, 100);
  } else if (['stockData', 'stockSeuils'].includes(field)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 2000) invalid(field);
    for (const [name, qty] of Object.entries(value)) { string(name, field, 200, true, true); if (['__proto__', 'constructor', 'prototype'].includes(name)) invalid(field); number(qty, field, true); }
  } else if (field === 'invConfig') {
    object(value, ['seuilGlobal', 'cycleJours'], field, ['seuilGlobal', 'cycleJours']); number(value.seuilGlobal, field, true); number(value.cycleJours, field, true, 1);
  } else if (field === 'invHistory') {
    list(value, field, item => { object(item, ['date', 'by', 'summary'], field, ['date', 'by', 'summary']); string(item.date, 'date', 100, true); string(item.by, 'by', 200); string(item.summary, 'summary', 10000); }, 1000);
  } else if (field === 'lastInventaire') {
    if (value !== null) { string(value, field, 40, true); if (Number.isNaN(Date.parse(value))) invalid(field); }
  } else invalid(field);
  if (['team', 'news', 'clients', 'aiAgents'].includes(field) && new Set(value.map(item => item.id)).size !== value.length) invalid('identifiants en double');
  return value;
}
module.exports = { validate };
