const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [i, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) new vm.Script(match[1], { filename: 'index.html#script' + i });
for (const directory of ['functions', 'lib', 'scripts', 'tests']) {
  for (const file of fs.readdirSync(path.join(root, directory))) {
    if (/\.(js|cjs)$/.test(file)) new vm.Script(fs.readFileSync(path.join(root, directory, file), 'utf8'), { filename: directory + '/' + file });
  }
}
new vm.Script(fs.readFileSync(path.join(root, 'operations.js'), 'utf8'), { filename: 'operations.js' });
if (/admin2026|farah2026|aleks2026|massage123|localStorage\.clear\(|id="(?:cc|cvc|exp)"/.test(html)) throw new Error('Ancien accès, reset global ou champ bancaire détecté.');
console.log('Syntaxe de tous les scripts validée ; anciens mots de passe et collecte bancaire retirés.');
