const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { build } = require('../scripts/build-web.js');
const root = path.resolve(__dirname, '..');

const out = build();
const www = (f) => path.join(out, f);
for (const f of ['index.html', 'app.js', 'config.js', 'data.js', 'logic.js', 'sfx.js', 'wheel.js', 'style.css', 'native-plugins.js', 'privacidad.html', 'icons/icon-192.png']) {
  assert(fs.existsSync(www(f)), 'falta en www/: ' + f);
}
assert(!fs.existsSync(www('sw.js')), 'el service worker no va en la app');
assert(!fs.existsSync(www('node_modules')));
const html = fs.readFileSync(www('index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
assert(scripts.indexOf('native-plugins.js') > -1 && scripts.indexOf('native-plugins.js') < scripts.indexOf('app.js'), 'la capa nativa va antes que app.js: ' + scripts);
assert.equal(scripts[scripts.length - 1], 'app.js');
const orig = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(!orig.includes('native-plugins.js'), 'la web publicada en Pages no debe cargar la capa nativa');
// el paquete de plugins no tira nada del navegador cuando no es Android
const bundle = fs.readFileSync(www('native-plugins.js'), 'utf8');
assert(bundle.length > 5000 && bundle.length < 200000, 'tamaño razonable: ' + bundle.length);
assert(/CCNativeSR/.test(bundle) && /AdMob/.test(bundle) && /SpeechRecognition/.test(bundle));
console.log('build OK (', Math.round(bundle.length / 1024), 'KB de capa nativa )');
