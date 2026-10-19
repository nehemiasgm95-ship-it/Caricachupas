global.self = global;
const assert = require('assert');
require('../data.js');
const L = require('../logic.js');
const D = self.CCData;
const cat = (id) => D.CATEGORIES.find((c) => c.id === id);
const idx = (id) => L.buildIndex(cat(id).list);
const ev = (text, letter, id = 'cuatro_patas', used = new Map()) => L.evaluate({ text, letter, index: idx(id), used });

assert.equal(ev('perro', 'P').status, 'valid');
assert.equal(ev('Un Perro', 'P').status, 'valid');           // artículo
assert.equal(ev('perros', 'P').status, 'valid');             // plural
assert.equal(ev('eh... perro', 'P').status, 'valid');        // muletilla
assert.equal(ev('oso polar', 'O').answer, 'oso polar');      // multi-palabra
assert.equal(ev('cebra', 'C').status, 'valid');
assert.equal(ev('gato', 'P').status, 'invalid');             // letra mala
assert.match(ev('gato', 'P').reason, /empieza con G/);
const used = new Map([[L.canonical('perro'), 'perro']]);
assert.equal(ev('perro', 'P', 'cuatro_patas', used).status, 'invalid');   // repetido
assert.equal(ev('perros', 'P', 'cuatro_patas', used).status, 'invalid');  // repetido en plural
assert.match(ev('pulpoide', 'P').reason, /no está en mi lista/);          // desconocido = inválido
assert.equal(ev('', 'P').status, 'invalid');
// tolerancia a errores del reconocedor
assert.equal(ev('hipopotamo', 'H').status, 'valid');         // h muda ok
assert.equal(ev('ipopotamo', 'H').status, 'valid');          // sin h inicial (fonético)
assert.equal(ev('jirafa', 'J').status, 'valid');
assert.equal(ev('jirafas', 'J').status, 'valid');
assert.equal(ev('rinoplastia', 'R').status, 'invalid');      // demasiado lejos
assert.equal(ev('hiena', 'H').status, 'valid');
assert.equal(ev('Águila', 'A', 'animales').status, 'valid');
assert.equal(ev('El Salvador', 'S', 'paises').status, 'valid');
assert.equal(ev('homero', 'H', 'simpson').status, 'valid');
assert.equal(ev('Moe', 'M', 'simpson').status, 'valid');
assert.equal(ev('pikachu', 'P', 'pokemon').status, 'valid');
assert.equal(ev('messi', 'M', 'futbolistas').status, 'valid');

// Todas las categorías: letras jugables por dificultad y sin listas vacías
for (const c of D.CATEGORIES) {
  assert(c.list && c.list.length >= 30, c.id + ' lista corta');
  const r = L.rankedLetters(c.list, D.LETTERS);
  assert(r.length >= 3, c.id + ' pocas letras: ' + r.join(''));
  for (const [k, d] of Object.entries(D.DIFFICULTIES)) {
    assert(L.lettersForRange(r, d.letters).length >= 1, c.id + ' ' + k);
  }
}
// cada dificultad tiene temas
for (const [k, d] of Object.entries(D.DIFFICULTIES)) {
  assert(D.CATEGORIES.filter((c) => d.levels.includes(c.level)).length >= 5, k);
}
// Letras fáciles tienen más palabras que las difíciles
const r = L.rankedLetters(cat('animales').list, D.LETTERS);
console.log('animales fácil:', L.lettersForRange(r, D.DIFFICULTIES.facil.letters).join(''),
  '| extremo:', L.lettersForRange(r, D.DIFFICULTIES.extremo.letters).join(''));
console.log('logic OK; categorías:', D.CATEGORIES.length);

// ---- retos y puntos ----
const R = D.RETOS.find((r) => r.id === 'larga'), C = D.RETOS.find((r) => r.id === 'corta');
assert(L.meetsReto('caballo', R) && !L.meetsReto('gato', R));       // 7+ letras
assert(L.meetsReto('gato', C) && !L.meetsReto('hipopotamo', C));    // ≤5 letras
assert(L.meetsReto('oso polar', C) === false);                      // sin contar espacios: 8
assert(L.meetsReto('cualquiera', null));
assert(L.retoFeasible(R, idx('animales'), 'C') && L.retoFeasible(C, idx('animales'), 'C'));
assert(!L.retoFeasible(R, idx('colores'), 'V', 99));            // exige más palabras de las que hay
assert.equal(L.scoreFor({ fracLeft: 1, streak: 1, mult: 1 }), 15);  // base 10 + rapidez 5
assert.equal(L.scoreFor({ fracLeft: 0, streak: 1, mult: 1 }), 10);
assert.equal(L.scoreFor({ fracLeft: 1, streak: 3, mult: 1 }), 21);  // + racha 6
assert.equal(L.scoreFor({ fracLeft: 1, streak: 99, mult: 1 }), 27);  // racha tope 12
assert.equal(L.scoreFor({ fracLeft: 1, streak: 1, mult: 2 }), 30);  // doble puntos
assert(D.PUNISHMENTS.every((p) => p.emoji && p.text));
console.log('retos y puntos OK');
