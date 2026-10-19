// Genera los íconos de Android desde los SVG de icons/ (requiere Playwright instalado aparte; solo se usa al cambiar el diseño).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const res = path.join(root, 'android/app/src/main/res');
const read = (f) => fs.readFileSync(path.join(root, 'icons', f), 'utf8');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const shot = async (html, size, file) => {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0;background:transparent">${html}</body>`);
    await p.screenshot({ path: file, omitBackground: true });
    await p.close();
  };
  const svgAt = (svg, px, extraStyle = '') => `<div style="width:${px}px;height:${px}px;${extraStyle}">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</div>`;
  for (const [d, k] of Object.entries(DENS)) {
    const dir = path.join(res, 'mipmap-' + d);
    const legacy = Math.round(48 * k), adaptive = Math.round(108 * k);
    await shot(svgAt(read('icon.svg'), legacy), legacy, path.join(dir, 'ic_launcher.png'));
    await shot(svgAt(read('maskable.svg'), legacy, 'border-radius:50%;overflow:hidden'), legacy, path.join(dir, 'ic_launcher_round.png'));
    await shot(svgAt(read('foreground.svg'), adaptive), adaptive, path.join(dir, 'ic_launcher_foreground.png'));
  }
  await b.close();
})();
