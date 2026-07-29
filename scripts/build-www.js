// Copies the static app source into www/, which is the "webDir" Capacitor
// packages into the native Android/iOS shells. No bundler/build step exists
// for this app (it's plain HTML/JS), so this is just a filtered copy —
// re-run (via `npm run sync`) whenever the source files change.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'www');

const INCLUDE = [
  'index.html',
  'exercises.js',
  'extended-rest-notifications.js',
  'manifest.json',
  'sw.js',
  'Aura',
  'assets',
];

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const item of INCLUDE) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) copyRecursive(src, path.join(dest, item));
}

console.log(`Copied ${INCLUDE.length} entries into ${dest}`);
