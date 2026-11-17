import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const distDir = path.join(root, 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

const cssMatch = html.match(/href="\.?\/assets\/([^"]+\.css)"/);
const jsMatch = html.match(/src="\.?\/assets\/([^"]+\.js)"/);

if (!cssMatch || !jsMatch) {
  throw new Error('Could not find CSS/JS asset tags in dist/index.html');
}

const css = fs.readFileSync(path.join(distDir, 'assets', cssMatch[1]), 'utf8');
const js = fs.readFileSync(path.join(distDir, 'assets', jsMatch[1]), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]+>/, () => `<style>${css}</style>`);
html = html.replace(/<script type="module"[^>]+><\/script>/, () => `<script type="module">${js}</script>`);

fs.writeFileSync(path.join(distDir, 'SnapPro-Offline.html'), html, 'utf8');
fs.writeFileSync(path.join(root, 'SnapPro-Offline.html'), html, 'utf8');

const manifest = {
  version: pkg.version || '2.6.0',
  minNativeVersion: '2.6.0',
  releasedAt: new Date().toISOString(),
  notes: pkg.releaseNotes || 'SnapPro Studio Update',
  htmlUrl: 'https://memories-stack.github.io/snappro/SnapPro-Offline.html',
  dmgUrl: 'https://github.com/memories-stack/snappro/releases/latest',
};

fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Generated dist/SnapPro-Offline.html (${html.length} bytes) and dist/version.json (v${manifest.version})`);
