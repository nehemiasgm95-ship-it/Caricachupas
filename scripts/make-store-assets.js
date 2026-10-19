// Genera los gráficos de la ficha de Google Play desde la propia app (requiere Playwright aparte).
//   PLAYWRIGHT_PATH=/ruta/a/playwright CHROMIUM_PATH=/ruta/a/chromium node scripts/make-store-assets.js
// Usa temas sin marcas (frutas, animales) para no mostrar nombres de terceros en las capturas.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'store');
const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', json: 'application/json', png: 'image/png' };

const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'text/plain' }); r.end(d); } });
}).listen(0);

(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    navigator.permissions.query = async () => ({ state: 'granted', onchange: null });
    window.SpeechRecognition = class { constructor() { window.__rec = this; } start() {} abort() {} };
    window.__say = (a, f) => { const r = a.map((t) => ({ transcript: t })); r.isFinal = f; window.__rec.onresult({ results: [r] }); };
  });
  await p.goto(url);
  await p.waitForSelector('#screen-setup.active');
  const shot = (name) => p.screenshot({ path: path.join(outDir, 'screenshots', name) });
  const setTopic = (cat, letter) => p.evaluate(([c, l]) => { const t = __cc.state.topic, category = CCData.CATEGORIES.find((x) => x.id === c);
    Object.assign(t, { category, letter: l, index: CCLogic.buildIndex(category.list), used: new Map(), turns: 0 }); }, [cat, letter]);

  // 1) jugadores y modo automático
  for (const n of ['Ana', 'Beto', 'Caro', 'Dani']) { await p.fill('#player-name', n); await p.press('#player-name', 'Enter'); }
  await p.click('.more summary'); await p.uncheck('#voice'); await p.uncheck('#retos'); await p.click('.more summary');
  await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await shot('1-jugadores.png');

  // 2) ruleta de dificultad girando
  await p.click('#btn-play'); await p.waitForSelector('#screen-wheel.active'); await p.click('#btn-spin');
  await p.waitForTimeout(1700); await shot('2-ruleta.png');
  await p.evaluate(() => CCWheel.setSpeed(0.05));

  // 3) turno con cronómetro y micrófono
  await p.waitForSelector('#screen-topic.active', { timeout: 20000 });
  await setTopic('frutas', 'M');
  await p.waitForSelector('#screen-turn.active', { timeout: 8000 });
  await p.waitForTimeout(1600); await p.evaluate(() => window.__say(['man'], false)); await p.waitForTimeout(150);
  await shot('3-turno.png');

  // 4) acierto con aplauso
  await p.evaluate(() => window.__say(['mango'], true)); await p.waitForSelector('#turn-heard.ok'); await p.waitForTimeout(260);
  await shot('4-acierto.png');

  // 5) resultados con premios
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__say(['zzzz'], true)); await p.waitForSelector('#screen-round-end.active');
  await p.click('#btn-results'); await p.waitForSelector('#screen-winner.active'); await p.waitForTimeout(2400);
  await shot('5-resultados.png');

  // Gráfico destacado 1024x500
  const icon = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8').replace('<svg ', '<svg width="300" height="300" ');
  const fp = await b.newPage({ viewport: { width: 1024, height: 500 } });
  await fp.setContent(`<body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    background:radial-gradient(90% 120% at 15% 10%,#4a2a8a 0%,#1b1033 62%);color:#f6f1ff;display:flex;align-items:center;gap:48px;padding:0 70px;box-sizing:border-box">
    <div style="flex:none;filter:drop-shadow(0 14px 28px rgba(0,0,0,.45))">${icon}</div>
    <div><div style="font-size:84px;font-weight:900;color:#ffd23f;letter-spacing:-2px;line-height:1">Caricachupas</div>
    <div style="font-size:36px;margin-top:18px;line-height:1.25;max-width:560px">Responde en voz alta antes de que se acabe el tiempo</div>
    <div style="margin-top:26px;display:flex;gap:12px;font-size:26px;font-weight:700"><span style="background:#33205c;border-radius:99px;padding:8px 20px">🎰 Ruleta</span><span style="background:#33205c;border-radius:99px;padding:8px 20px">👥 Equipos</span><span style="background:#33205c;border-radius:99px;padding:8px 20px">🎤 Con voz</span></div></div></body>`);
  await fp.screenshot({ path: path.join(outDir, 'feature-graphic-1024x500.png') });
  fs.copyFileSync(path.join(root, 'icons/icon-512.png'), path.join(outDir, 'icon-512.png'));
  await b.close(); srv.close();
  console.log('Materiales de la tienda en store/');
})().catch((e) => { console.error(e); process.exit(1); });
