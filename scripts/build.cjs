const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const name of ['index.html', 'operations.js']) fs.copyFileSync(path.join(root, name), path.join(dist, name));
console.log('Site public préparé dans dist/ (2 fichiers, aucun code serveur ni document interne).');
