const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const name of ['index.html', 'admin.html', 'operations.js', 'google5e81c9b146b2e8ad.html', 'robots.txt', 'sitemap.xml', 'mentions-legales.html', 'cgv.html', 'confidentialite.html', '404.html', 'og-image.jpg', 'favicon.png', 'favicon-48.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(root, name), path.join(dist, name));
console.log('Site public préparé dans dist/.');
