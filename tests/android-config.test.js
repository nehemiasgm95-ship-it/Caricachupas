// Revisa la configuración del proyecto Android sin necesitar el SDK (eso lo compila CI).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const A = (p) => path.join(root, 'android', p);
const read = (p) => fs.readFileSync(A(p), 'utf8');

// 1) todos los XML están bien formados
const xmls = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.xml')) xmls.push(p); } })(A('app/src/main'));
for (const f of xmls) {
  try { execFileSync('python3', ['-c', 'import sys,xml.dom.minidom as m; m.parse(sys.argv[1])', f], { stdio: 'pipe' }); }
  catch (e) { assert.fail('XML mal formado: ' + path.relative(root, f) + '\n' + e.stderr); }
}

// 2) manifiesto
const man = read('app/src/main/AndroidManifest.xml');
assert(/android:allowBackup="false"/.test(man), 'sin copias de seguridad');
assert(/android:usesCleartextTraffic="false"/.test(man), 'sin tráfico sin cifrar');
for (const perm of ['android.permission.INTERNET', 'android.permission.RECORD_AUDIO', 'com.google.android.gms.permission.AD_ID']) assert(man.includes(perm), 'permiso ' + perm);
const perms = [...man.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1]);
assert.equal(perms.length, 3, 'solo los permisos necesarios: ' + perms);
assert(/android:exported="true"/.test(man) && (man.match(/android:exported="true"/g) || []).length === 1, 'solo la pantalla principal está expuesta');
assert(/APPLICATION_ID"[\s\S]*@string\/admob_app_id/.test(man));
assert(/android.speech.RecognitionService/.test(man), 'visibilidad del servicio de voz (Android 11+)');
// los recursos que usa existen
const strings = read('app/src/main/res/values/admob.xml') + read('app/src/main/res/values/strings.xml');
assert(/name="admob_app_id"/.test(strings));
for (const m of man.matchAll(/@string\/([a-z_]+)/g)) assert(strings.includes(`name="${m[1]}"`), 'falta string ' + m[1]);
for (const m of man.matchAll(/@mipmap\/([a-z_]+)/g)) assert(fs.existsSync(A(`app/src/main/res/mipmap-xxxhdpi/${m[1]}.png`)) || fs.existsSync(A(`app/src/main/res/mipmap-anydpi-v26/${m[1]}.xml`)), 'falta ícono ' + m[1]);
const styles = read('app/src/main/res/values/styles.xml');
for (const m of styles.matchAll(/@(?:mipmap|drawable|color)\/([a-zA-Z_]+)/g)) {
  const found = ['mipmap-xxxhdpi', 'drawable', 'drawable-v24', 'values'].some((d) => {
    const dir = A('app/src/main/res/' + d); return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith(m[1] + '.') || (d === 'values' && fs.readFileSync(path.join(dir, f), 'utf8').includes(`name="${m[1]}"`)));
  });
  assert(found, 'styles.xml referencia un recurso inexistente: ' + m[0]);
}
assert(!/@drawable\/splash\b/.test(styles), 'ya no hay imagen de inicio de ejemplo');

// 3) versión de destino exigida por Google Play (API 36 para apps nuevas desde el 31-ago-2026)
const vars = read('variables.gradle');
assert(+vars.match(/targetSdkVersion\s*=\s*(\d+)/)[1] >= 36, 'targetSdk >= 36');
assert(+vars.match(/compileSdkVersion\s*=\s*(\d+)/)[1] >= 36, 'compileSdk >= 36');
assert(+vars.match(/minSdkVersion\s*=\s*(\d+)/)[1] <= 26, 'minSdk razonable para alcanzar casi todos los teléfonos');

// 4) coherencia de identificadores
const cap = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const gradle = read('app/build.gradle');
assert(gradle.includes(`applicationId "${cap.appId}"`) && gradle.includes(`namespace = "${cap.appId}"`));
assert(cap.android.webContentsDebuggingEnabled === false && cap.loggingBehavior === 'none' && cap.allowMixedContent === false);
assert(cap.server.androidScheme === 'https');
assert(fs.existsSync(A(`app/src/main/java/${cap.appId.replace(/\./g, '/')}/MainActivity.java`)), 'MainActivity en el paquete correcto');

// 5) firma: nunca llaves en el repositorio; el build lee variables de entorno
assert(/KEYSTORE_FILE/.test(gradle) && !/storePassword\s+["'][^"']+["']/.test(gradle), 'contraseñas solo por variables de entorno');
const tracked = execFileSync('git', ['ls-files'], { cwd: root }).toString().split('\n');
assert(!tracked.some((f) => /\.(jks|keystore|p12|pem)$/i.test(f) || /keystore\.properties$/.test(f)), 'ninguna llave rastreada por git');
const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
for (const pat of ['*.jks', '*.keystore', 'keystore.properties', 'node_modules/']) assert(gi.includes(pat), '.gitignore incluye ' + pat);

// 6) íconos en todas las densidades
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) for (const n of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) assert(fs.existsSync(A(`app/src/main/res/mipmap-${d}/${n}.png`)), `ícono ${n} ${d}`);
console.log('android-config OK (', xmls.length, 'XML revisados )');

// 7) set-app-id cambia todo de forma coherente (se prueba en una copia temporal)
{
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-appid-'));
  const copy = (rel) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.copyFileSync(path.join(root, rel), path.join(tmp, rel)); };
  const oldId = cap.appId;
  ['capacitor.config.json', 'android/app/build.gradle', 'android/app/src/main/res/values/strings.xml',
    `android/app/src/main/java/${oldId.replace(/\./g, '/')}/MainActivity.java`].forEach(copy);
  fs.mkdirSync(path.join(tmp, 'scripts')); fs.copyFileSync(path.join(root, 'scripts/set-app-id.js'), path.join(tmp, 'scripts/set-app-id.js'));
  execFileSync('node', [path.join(tmp, 'scripts/set-app-id.js'), 'io.prueba.mijuego'], { stdio: 'pipe' });
  const nc = JSON.parse(fs.readFileSync(path.join(tmp, 'capacitor.config.json'), 'utf8'));
  assert.equal(nc.appId, 'io.prueba.mijuego');
  const g = fs.readFileSync(path.join(tmp, 'android/app/build.gradle'), 'utf8');
  assert(g.includes('applicationId "io.prueba.mijuego"') && g.includes('namespace = "io.prueba.mijuego"') && !g.includes(oldId));
  assert(fs.readFileSync(path.join(tmp, 'android/app/src/main/res/values/strings.xml'), 'utf8').includes('io.prueba.mijuego'));
  const act = path.join(tmp, 'android/app/src/main/java/io/prueba/mijuego/MainActivity.java');
  assert(fs.existsSync(act) && /package io\.prueba\.mijuego;/.test(fs.readFileSync(act, 'utf8')));
  assert(!fs.existsSync(path.join(tmp, 'android/app/src/main/java/com')), 'sin carpetas viejas');
  // nombres inválidos se rechazan
  for (const bad of ['Caricachupas', 'com.Mayus.app', 'com..x', '1com.app']) {
    let failed = false; try { execFileSync('node', [path.join(tmp, 'scripts/set-app-id.js'), bad], { stdio: 'pipe' }); } catch (_) { failed = true; }
    assert(failed, 'rechaza ' + bad);
  }
}
console.log('set-app-id OK');
