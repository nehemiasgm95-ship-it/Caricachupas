// Revisa que la versión que se va a subir a Google Play no lleve cosas de prueba o sin completar.
// Uso: node scripts/check-release.js   (sale con error si algo falta)
const fs = require('fs');
const path = require('path');

const root = process.env.CC_ROOT ? path.resolve(process.env.CC_ROOT) : path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const problems = [], warnings = [];

function loadConfig() {
  const sandbox = { window: {} };
  new Function('window', read('config.js'))(sandbox.window);
  return sandbox.window.CC_CONFIG;
}

function check() {
  const cap = JSON.parse(read('capacitor.config.json'));
  if (/^com\.(example|ionic)\./.test(cap.appId)) problems.push(`capacitor.config.json: appId "${cap.appId}" es de ejemplo`);

  const cfg = loadConfig();
  const ads = cfg.ads || {};
  if (ads.enabled) {
    if (ads.useTestIds !== false) problems.push('config.js: ads.useTestIds debe ser false en la versión de tienda');
    for (const k of ['banner', 'interstitial', 'rewarded']) {
      const id = (ads.ids || {})[k] || '';
      if (!/^ca-app-pub-\d+\/\d+$/.test(id)) problems.push(`config.js: ads.ids.${k} no es un ID de AdMob real`);
      if (id.startsWith('ca-app-pub-3940256099942544')) problems.push(`config.js: ads.ids.${k} es un ID de prueba de Google`);
    }
    const strings = read('android/app/src/main/res/values/admob.xml');
    const m = strings.match(/name="admob_app_id"[^>]*>([^<]+)</);
    if (!m || !/^ca-app-pub-\d+~\d+$/.test(m[1].trim())) problems.push('android/.../values/admob.xml: admob_app_id no es válido');
    else if (m[1].trim().startsWith('ca-app-pub-3940256099942544')) problems.push('android/.../values/admob.xml: admob_app_id es el de prueba de Google');
  }

  const fb = (cfg.feedback || {});
  if (!fb.formUrl) warnings.push('config.js: feedback.formUrl está vacío (las opiniones solo se podrán compartir, no recibir)');

  const priv = read('privacidad.html');
  const open = priv.match(/\[[A-ZÁÉÍÓÚÑ][^\]]{2,}\]/g);
  if (open) problems.push('privacidad.html tiene datos sin completar: ' + [...new Set(open)].map((x) => (x.length > 38 ? x.slice(0, 35) + '…]' : x)).join(', '));
  if (/BORRADOR/.test(priv)) problems.push('privacidad.html todavía tiene el aviso de BORRADOR');

  const manifest = read('android/app/src/main/AndroidManifest.xml');
  if (/allowBackup="true"/.test(manifest)) problems.push('AndroidManifest.xml: allowBackup debe ser false');
  if (/usesCleartextTraffic="true"/.test(manifest)) problems.push('AndroidManifest.xml: no se permite tráfico sin cifrar');
  return { problems, warnings };
}

if (require.main === module) {
  const { problems: p, warnings: w } = check();
  w.forEach((x) => console.log('⚠️ ', x));
  if (p.length) { p.forEach((x) => console.error('❌', x)); console.error(`\n${p.length} problema(s): la versión de tienda NO está lista.`); process.exit(1); }
  console.log('✅ Revisión de versión de tienda: sin problemas');
}
module.exports = { check };
