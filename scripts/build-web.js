// Prepara www/ (lo que se empaqueta dentro de la app Android): copia la web, agrega la capa nativa
// y quita lo que solo sirve en el navegador (service worker). La web publicada en Pages no cambia.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const FILES = ['index.html', 'style.css', 'config.js', 'data.js', 'logic.js', 'sfx.js', 'wheel.js', 'app.js', 'privacidad.html', 'manifest.json'];

function build() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
  fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });

  esbuild.buildSync({
    entryPoints: [path.join(root, 'native/bridge.mjs')],
    outfile: path.join(out, 'native-plugins.js'),
    bundle: true, format: 'iife', minify: true, target: ['chrome100'], legalComments: 'none',
  });

  // La capa nativa debe cargarse antes que app.js (app.js decide qué reconocedor usar al arrancar).
  const htmlPath = path.join(out, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const tag = '<script src="app.js"></script>';
  if (!html.includes(tag)) throw new Error('index.html no tiene la etiqueta de app.js');
  html = html.replace(tag, '<script src="native-plugins.js"></script>\n' + tag);
  fs.writeFileSync(htmlPath, html);
  return out;
}

if (require.main === module) { build(); console.log('www/ listo'); }
module.exports = { build, FILES };
