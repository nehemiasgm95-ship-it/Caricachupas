// La revisión de versión de tienda debe FALLAR con lo que hay hoy (pruebas y borradores) y PASAR con valores reales.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/check-release.js');
const run = (dir) => spawnSync('node', [script], { env: { ...process.env, CC_ROOT: dir }, encoding: 'utf8' });

// estado actual del repositorio: no está listo para tienda, y dice por qué
let r = run(root);
assert.equal(r.status, 1, 'el estado actual no debe pasar');
for (const frag of ['useTestIds', 'ID de AdMob real', 'admob_app_id', 'privacidad.html']) assert(r.stderr.includes(frag), 'menciona: ' + frag + '\n' + r.stderr);

// fixture válido
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-release-'));
const put = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), txt); };
put('capacitor.config.json', JSON.stringify({ appId: 'com.miempresa.caricachupas' }));
put('config.js', `window.CC_CONFIG = { feedback: { formUrl: 'https://docs.google.com/forms/d/e/X/formResponse' }, ads: { enabled: true, useTestIds: false, ids: { banner: 'ca-app-pub-1234567890123456/1111111111', interstitial: 'ca-app-pub-1234567890123456/2222222222', rewarded: 'ca-app-pub-1234567890123456/3333333333' } } };`);
put('android/app/src/main/res/values/admob.xml', '<resources><string name="admob_app_id">ca-app-pub-1234567890123456~9999999999</string></resources>');
put('android/app/src/main/AndroidManifest.xml', '<manifest><application android:allowBackup="false" android:usesCleartextTraffic="false"/></manifest>');
put('privacidad.html', '<html><body>Política completa. Contacto: yo@ejemplo.com</body></html>');
r = run(dir);
assert.equal(r.status, 0, 'el fixture válido debe pasar\n' + r.stderr + r.stdout);

// cada defecto por separado se detecta
const cases = [
  ['appId de ejemplo', () => put('capacitor.config.json', JSON.stringify({ appId: 'com.example.app' })), /appId/],
  ['ID de prueba de Google', () => put('config.js', fs.readFileSync(path.join(dir, 'config.js'), 'utf8').replace('ca-app-pub-1234567890123456/1111111111', 'ca-app-pub-3940256099942544/6300978111')), /prueba de Google/],
  ['allowBackup', () => put('android/app/src/main/AndroidManifest.xml', '<manifest><application android:allowBackup="true"/></manifest>'), /allowBackup/],
  ['aviso de borrador', () => put('privacidad.html', '<html>BORRADOR Contacto: yo@ejemplo.com</html>'), /BORRADOR/],
  ['corchetes sin completar', () => put('privacidad.html', '<html>Contacto: [CORREO DE CONTACTO]</html>'), /sin completar/],
];
for (const [name, mutate, re] of cases) {
  // restaurar el fixture válido antes de cada caso
  put('capacitor.config.json', JSON.stringify({ appId: 'com.miempresa.caricachupas' }));
  put('config.js', `window.CC_CONFIG = { feedback: { formUrl: 'x' }, ads: { enabled: true, useTestIds: false, ids: { banner: 'ca-app-pub-1234567890123456/1111111111', interstitial: 'ca-app-pub-1234567890123456/2222222222', rewarded: 'ca-app-pub-1234567890123456/3333333333' } } };`);
  put('android/app/src/main/AndroidManifest.xml', '<manifest><application android:allowBackup="false" android:usesCleartextTraffic="false"/></manifest>');
  put('privacidad.html', '<html>Política completa. Contacto: yo@ejemplo.com</html>');
  mutate();
  const x = run(dir);
  assert.equal(x.status, 1, 'debe fallar: ' + name);
  assert(re.test(x.stderr), `mensaje claro para "${name}": ${x.stderr}`);
}
console.log('check-release OK (', cases.length + 2, 'escenarios )');
