'use strict';

const fs = require('fs');
const path = require('path');
const { ensureVendor } = require('../src/util');

const root = path.join(__dirname, '..');
ensureVendor(root);
const dest = path.join(root, 'public', 'vendor', 'highlight');
if (fs.existsSync(dest)) {
  console.log('[vendor] highlight.js 静态资源已就位:', fs.readdirSync(dest).join(', '));
}

// 落地页动效库：GSAP + ScrollTrigger + Lenis 平滑滚动（本地自托管，无 CDN 依赖）
const animLibs = [
  ['gsap', path.join('gsap', 'dist', 'gsap.min.js')],
  ['gsap', path.join('gsap', 'dist', 'ScrollTrigger.min.js')],
  ['lenis', path.join('lenis', 'dist', 'lenis.min.js')],
];
for (const [dir, srcRel] of animLibs) {
  const src = path.join(root, 'node_modules', srcRel);
  const targetDir = path.join(root, 'public', 'vendor', dir);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(src, path.join(targetDir, path.basename(srcRel)));
}
console.log('[vendor] 动效库已就位:', animLibs.map(([, f]) => f).join(', '));

// 落地页展示字体：Anton（斜体大字）+ Space Mono（mono 标签），自托管 woff2，离线可部署
const fontFiles = [
  path.join('@fontsource', 'anton', 'files', 'anton-latin-400-normal.woff2'),
  path.join('@fontsource', 'space-mono', 'files', 'space-mono-latin-400-normal.woff2'),
  path.join('@fontsource', 'space-mono', 'files', 'space-mono-latin-700-normal.woff2'),
];
const fontsDir = path.join(root, 'public', 'vendor', 'fonts');
fs.mkdirSync(fontsDir, { recursive: true });
for (const srcRel of fontFiles) {
  fs.copyFileSync(path.join(root, 'node_modules', srcRel), path.join(fontsDir, path.basename(srcRel)));
}
console.log('[vendor] 字体已就位:', fontFiles.map((f) => path.basename(f)).join(', '));
