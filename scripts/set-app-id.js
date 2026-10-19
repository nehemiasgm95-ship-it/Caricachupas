// Cambia el nombre de paquete de la app Android en todos los lugares a la vez.
// Hazlo ANTES de crear la app en Google Play: después no se puede cambiar.
//   node scripts/set-app-id.js com.tuempresa.caricachupas
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const newId = process.argv[2];
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(newId || '')) {
  console.error('Uso: node scripts/set-app-id.js com.tuempresa.caricachupas\n(minúsculas, números y _, con al menos dos partes separadas por puntos)');
  process.exit(1);
}
const capPath = path.join(root, 'capacitor.config.json');
const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
const oldId = cap.appId;
if (oldId === newId) { console.log('Ya era ' + newId); process.exit(0); }

const edit = (rel, fn) => { const p = path.join(root, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
const all = (s) => s.split(oldId).join(newId);

cap.appId = newId;
fs.writeFileSync(capPath, JSON.stringify(cap, null, 2) + '\n');
edit('android/app/build.gradle', all);
edit('android/app/src/main/res/values/strings.xml', all);

// MainActivity vive en una carpeta con el nombre del paquete.
const javaRoot = path.join(root, 'android/app/src/main/java');
const oldDir = path.join(javaRoot, ...oldId.split('.'));
const newDir = path.join(javaRoot, ...newId.split('.'));
fs.mkdirSync(newDir, { recursive: true });
for (const f of fs.readdirSync(oldDir)) {
  const txt = all(fs.readFileSync(path.join(oldDir, f), 'utf8'));
  fs.writeFileSync(path.join(newDir, f), txt);
  fs.unlinkSync(path.join(oldDir, f));
}
// borrar carpetas vacías del paquete anterior
for (let d = oldDir; d !== javaRoot && fs.existsSync(d) && fs.readdirSync(d).length === 0; d = path.dirname(d)) fs.rmdirSync(d);

console.log(`Nombre de paquete: ${oldId} → ${newId}`);
console.log('Siguiente: npm test  (revisa que todo quedó coherente)');
