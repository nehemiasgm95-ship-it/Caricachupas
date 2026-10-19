// Corre todas las pruebas de Node. Uso: npm test
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter((f) => /\.test\.(js|mjs)$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync('node', [path.join(__dirname, f)], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  if (r.status === 0) console.log('✅', f.padEnd(28), last);
  else { failed++; console.log('❌', f); console.log((r.stdout || '') + (r.stderr || '')); }
}
console.log(failed ? `\n${failed} archivo(s) con fallos` : `\nTodo en orden (${files.length} archivos)`);
process.exit(failed ? 1 : 0);
