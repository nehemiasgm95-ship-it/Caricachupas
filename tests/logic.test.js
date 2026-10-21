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

// ---- temas libres (sin letra) y progresión de dificultad
{
  const idxA = L.buildIndex(cat('selecciones').list);
  const free = (t) => L.evaluate({ text: t, letter: null, index: idxA, used: new Map() });
  assert.equal(free('Brasil').status, 'valid');                  // cualquier letra vale
  assert.equal(free('senegal').status, 'valid');
  assert.equal(free('el salvador').status, 'valid');
  assert.equal(free('Marte').status, 'invalid');
  assert.equal(free('Marte').code, 'unknown');
  assert.doesNotMatch(free('Marte').reason, /empieza con/);       // sin regla de letra no se habla de letras
  const used = new Map([[L.canonical('brasil'), 'brasil']]);
  assert.equal(L.evaluate({ text: 'brasil', letter: null, index: idxA, used }).code, 'repeat');
  // retos de largo con tema libre cuentan todas las palabras
  assert(L.retoFeasible(D.RETOS.find((r) => r.id === 'larga'), idxA, null));

  const st = (round, base = 'facil', progressive = true) => L.stageFor({ round, base, progressive, ...D.PROGRESSION });
  assert.deepEqual([1, 2].map((r) => st(r).free), [true, true], 'las dos primeras rondas son libres');
  assert.deepEqual([3, 4, 5, 6, 7, 8, 9, 10, 20].map((r) => st(r).diffKey),
    ['facil', 'facil', 'medio', 'medio', 'dificil', 'dificil', 'extremo', 'extremo', 'extremo'], 'sube un nivel cada 2 temas');
  assert.deepEqual([3, 5, 7, 9].map((r) => st(r).stepsUp), [0, 1, 2, 3]);
  assert.equal(st(3).free, false);
  assert.deepEqual([3, 5, 7, 9, 30].map((r) => st(r, 'dificil').diffKey), ['dificil', 'extremo', 'extremo', 'extremo', 'extremo'], 'desde difícil llega antes al tope');
  assert.deepEqual([1, 5, 9].map((r) => st(r, 'extremo').stepsUp), [0, 0, 0], 'extremo ya está arriba');
  assert.deepEqual([1, 2, 3, 9].map((r) => st(r, 'medio', false)), Array(4).fill({ free: false, diffKey: 'medio', stepsUp: 0 }), 'sin progresión: como antes');
  // temas de arranque: generales y con listas amplias
  const warm = D.CATEGORIES.filter((c) => c.warmup);
  assert(warm.length >= 10 && warm.every((c) => c.level === 1 || ['selecciones'].includes(c.id)), 'temas de arranque: ' + warm.map((c) => c.id));
  assert(warm.every((c) => c.list.length >= 30));
  const names = D.CATEGORIES.map((c) => c.name);
  for (const n of ['Selecciones de fútbol', 'Cosas que hay en la cocina', 'Cosas que puedes comprar en el supermercado', 'Animales de cuatro patas']) assert(names.includes(n), n);
  assert(D.CATEGORIES.find((c) => c.id === 'cocina').warmup && D.CATEGORIES.find((c) => c.id === 'super').warmup && D.CATEGORIES.find((c) => c.id === 'selecciones').warmup);
}
console.log('temas libres y progresión OK');
