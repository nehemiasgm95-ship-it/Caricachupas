// Lógica pura del juego (sin DOM): normalización y juez automático de respuestas.
(function (root) {
  const ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas']);

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Normaliza y quita artículos iniciales: "El Salvador" -> "salvador".
  function clean(s) {
    const tokens = normalize(s).split(' ').filter(Boolean);
    while (tokens.length > 1 && ARTICLES.has(tokens[0])) tokens.shift();
    return tokens.join(' ');
  }

  // Clave para comparar singular/plural y detectar repetidos.
  function canonical(s) {
    const c = clean(s);
    if (c.length > 4 && c.endsWith('es')) return c.slice(0, -2);
    if (c.length > 3 && c.endsWith('s')) return c.slice(0, -1);
    return c;
  }

  // Clave fonética del español: iguala b/v, c/s/z, ll/y, h muda, qu/k...
  // Sirve cuando el reconocedor de voz escribe una palabra "como suena".
  function phonetic(s) {
    return normalize(s)
      .replace(/\s/g, '')
      .replace(/ch/g, '#')
      .replace(/h/g, '')
      .replace(/#/g, 'ch')
      .replace(/ll/g, 'y')
      .replace(/qu/g, 'k')
      .replace(/c(?=[ei])/g, 's')
      .replace(/c/g, 'k')
      .replace(/z/g, 's')
      .replace(/[vw]/g, 'b')
      .replace(/gu(?=[ei])/g, 'g')
      .replace(/g(?=[ei])/g, 'j')
      .replace(/(.)\1+/g, '$1');
  }

  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // Índice de una lista de palabras para búsquedas exactas, fonéticas y aproximadas.
  function buildIndex(words) {
    const entries = [];
    const seen = new Set();
    for (const w of words) {
      const key = canonical(w);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({ key, display: clean(w), phon: phonetic(key), initial: key[0] });
    }
    return {
      entries,
      byKey: new Map(entries.map((e) => [e.key, e])),
      byPhon: entries.reduce((m, e) => (m.set(e.phon, (m.get(e.phon) || []).concat(e)), m), new Map()),
    };
  }

  // Busca una frase en el índice. `accept(entry)` filtra (p. ej. por letra inicial).
  function lookup(index, phrase, accept) {
    const key = canonical(phrase);
    const exact = index.byKey.get(key);
    if (exact && accept(exact)) return exact;

    const ph = phonetic(phrase);
    const sound = (index.byPhon.get(ph) || []).find(accept);
    if (sound) return sound;

    // Tolerancia a errores de reconocimiento: 1 letra en palabras de 5+, 2 en las de 9+.
    const max = key.length >= 9 ? 2 : key.length >= 5 ? 1 : 0;
    if (!max) return null;
    let best = null, bestD = max + 1;
    for (const e of index.entries) {
      if (!accept(e)) continue;
      const d = Math.min(distance(key, e.key, max), distance(ph, e.phon, max));
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // Todas las sub-frases contiguas (hasta 4 palabras), las más largas primero.
  function subPhrases(text) {
    const t = clean(text).split(' ').filter(Boolean);
    const out = [];
    for (let len = Math.min(4, t.length); len >= 1; len--) {
      for (let i = 0; i + len <= t.length; i++) out.push(t.slice(i, i + len).join(' '));
    }
    return out;
  }

  /**
   * Juez automático. Decide solo: válida o inválida.
   * @param {{text:string, letter:string, index:object, used:Map<string,string>}} p
   * @returns {{status:'valid'|'invalid', code:'ok'|'empty'|'repeat'|'letter'|'unknown', answer:string, key:string, reason:string}}
   */
  function evaluate({ text, letter, index, used }) {
    const spoken = clean(text);
    if (!spoken) return { status: 'invalid', code: 'empty', answer: '', key: '', reason: 'No se entendió nada' };
    const L = letter ? letter.toLowerCase() : null;
    const letterOk = (e) => !L || e.initial === L;
    const any = () => true;

    for (const phrase of subPhrases(text)) {
      const hit = lookup(index, phrase, letterOk);
      if (!hit) continue;
      if (used && used.has(hit.key)) {
        return { status: 'invalid', code: 'repeat', answer: hit.display, key: hit.key, reason: `"${hit.display}" ya se dijo` };
      }
      return { status: 'valid', code: 'ok', answer: hit.display, key: hit.key, reason: 'Correcta' };
    }

    // No hubo acierto: explicar por qué.
    for (const phrase of subPhrases(text)) {
      const wrong = lookup(index, phrase, any);
      if (wrong) {
        return {
          status: 'invalid', code: 'letter', answer: wrong.display, key: '',
          reason: `"${wrong.display}" empieza con ${wrong.initial.toUpperCase()}, no con ${letter.toUpperCase()}`,
        };
      }
    }
    return { status: 'invalid', code: 'unknown', answer: spoken, key: '', reason: `"${spoken}" no está en mi lista de este tema` };
  }

  // Letras jugables (≥ min palabras), ordenadas de la más fácil a la más rara.
  function rankedLetters(words, allLetters, min = 3) {
    const counts = {};
    const seen = new Set();
    for (const w of words) {
      const k = canonical(w);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      counts[k[0]] = (counts[k[0]] || 0) + 1;
    }
    return allLetters
      .filter((l) => (counts[l.toLowerCase()] || 0) >= min)
      .sort((a, b) => counts[b.toLowerCase()] - counts[a.toLowerCase()]);
  }

  // Parte del ranking según la dificultad: range = [desde, hasta] en 0..1.
  function lettersForRange(ranked, range) {
    const n = ranked.length;
    const from = Math.min(n - 1, Math.floor(n * range[0]));
    const to = Math.max(from + 1, Math.ceil(n * range[1]));
    return ranked.slice(from, to);
  }

  // ¿La palabra cumple el reto de largo (sin contar espacios)?
  function meetsReto(answer, reto) {
    if (!reto || (!reto.min && !reto.max)) return true;
    const len = String(answer || '').replace(/\s/g, '').length;
    if (reto.min && len < reto.min) return false;
    if (reto.max && len > reto.max) return false;
    return true;
  }
  // ¿Hay suficientes palabras en la lista con esa letra para que el reto sea jugable?
  function retoFeasible(reto, index, letter, minWords = 3) {
    if (!reto.min && !reto.max) return true;
    const L = letter.toLowerCase();
    return index.entries.filter((e) => e.initial === L && meetsReto(e.key, reto)).length >= minWords;
  }

  // Puntos de un acierto: base + rapidez (0 a 5) + racha (3 por acierto seguido, máx 12), por el multiplicador.
  function scoreFor({ fracLeft, streak, mult }) {
    const speed = Math.round(5 * Math.max(0, Math.min(1, fracLeft)));
    const combo = Math.min(12, Math.max(0, streak - 1) * 3);
    return (10 + speed + combo) * (mult || 1);
  }

  const api = {
    meetsReto, retoFeasible, scoreFor,
    normalize, clean, canonical, phonetic, distance,
    buildIndex, evaluate, rankedLetters, lettersForRange,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCLogic = api;
})(typeof self !== 'undefined' ? self : this);
