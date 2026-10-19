import assert from 'node:assert/strict';
import { createSpeechRecognition, createMicPermissions } from '../native/speech-adapter.mjs';

// Plugin simulado con el mismo comportamiento que el real (ver SpeechRecognition.java).
function fakePlugin() {
  const listeners = { partialResults: [], listeningState: [] };
  const p = {
    listening: false, started: 0, stopped: 0, startOpts: null, removed: 0,
    async addListener(name, fn) { listeners[name].push(fn); return { remove() { p.removed++; listeners[name] = listeners[name].filter((f) => f !== fn); } }; },
    async start(o) { p.started++; p.startOpts = o; p.listening = true; },
    async stop() { p.stopped++; p.listening = false; },
    async isListening() { return { listening: p.listening }; },
    emit(name, data) { listeners[name].slice().forEach((f) => f(data)); },
    listenerCount() { return listeners.partialResults.length + listeners.listeningState.length; },
  };
  return p;
}
// Reloj manual para no esperar tiempos reales.
function fakeTimers() {
  let now = 0, id = 0; const jobs = new Map();
  return {
    setTimeout(fn, ms) { const k = ++id; jobs.set(k, { at: now + ms, fn }); return k; },
    clearTimeout(k) { jobs.delete(k); },
    setInterval(fn, ms) { const k = ++id; jobs.set(k, { at: now + ms, fn, every: ms }); return k; },
    clearInterval(k) { jobs.delete(k); },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...jobs.entries()].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [k, j] = next; now = j.at;
        if (j.every) j.at += j.every; else jobs.delete(k);
        await j.fn(); await Promise.resolve(); await Promise.resolve();
      }
      now = end;
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));

// 1) parciales -> evento "stopped" -> resultado final DESPUÉS de stopped
{
  const plugin = fakePlugin(), t = fakeTimers(), SR = createSpeechRecognition(plugin, t);
  const rec = new SR(); rec.lang = 'es-MX'; rec.maxAlternatives = 5;
  const got = []; let ended = 0;
  rec.onresult = (e) => got.push({ alts: Array.from(e.results[0], (a) => a.transcript), final: e.results[0].isFinal });
  rec.onend = () => ended++;
  rec.start(); await tick(); await tick();
  assert.deepEqual(plugin.startOpts, { language: 'es-MX', maxResults: 5, partialResults: true, popup: false });
  plugin.emit('partialResults', { matches: ['cab'] });
  plugin.emit('partialResults', { matches: ['caballo'] });
  plugin.listening = false; plugin.emit('listeningState', { status: 'stopped' });   // terminó de hablar
  plugin.emit('partialResults', { matches: ['caballo', 'caballos', 'cabello'] });   // llega el final después
  await t.advance(1500);
  assert.deepEqual(got.map((g) => g.final), [false, false, false, true]);
  assert.deepEqual(got[3].alts, ['caballo', 'caballos', 'cabello']);               // el final trae las alternativas
  assert.equal(ended, 1);
  assert.equal(plugin.listenerCount(), 0, 'se quitan los oyentes al terminar');
  assert.equal(plugin.removed, 2);
}

// 2) error silencioso del plugin (sin coincidencia): se detecta con isListening() y termina sin resultado
{
  const plugin = fakePlugin(), t = fakeTimers(), SR = createSpeechRecognition(plugin, t);
  const rec = new SR(); let results = 0, ended = 0;
  rec.onresult = () => results++; rec.onend = () => ended++;
  rec.start(); await tick(); await tick();
  plugin.listening = false;                       // Android cortó por silencio, sin avisar
  await t.advance(3000);
  assert.equal(results, 0); assert.equal(ended, 1);
  assert.equal(plugin.listenerCount(), 0);
  // y se puede volver a empezar (la app reinicia en onend)
  rec.start(); await tick(); await tick();
  assert.equal(plugin.started, 2);
}

// 3) abort(): detiene, limpia y avisa onend sin resultados
{
  const plugin = fakePlugin(), t = fakeTimers(), SR = createSpeechRecognition(plugin, t);
  const rec = new SR(); let results = 0, ended = 0;
  rec.onresult = () => results++; rec.onend = () => ended++;
  rec.start(); await tick(); await tick();
  plugin.emit('partialResults', { matches: ['hola'] });
  rec.abort(); await t.advance(10); await tick();
  assert.equal(plugin.stopped, 1); assert.equal(ended, 1); assert.equal(plugin.listenerCount(), 0);
  const before = results;
  plugin.emit('partialResults', { matches: ['tarde'] });                   // lo que llegue después se ignora
  await t.advance(2000);
  assert.equal(results, before);
}

// 4) abort() inmediato, antes de que termine de prepararse, no deja oyentes colgados
{
  const plugin = fakePlugin(), t = fakeTimers(), SR = createSpeechRecognition(plugin, t);
  const rec = new SR(); rec.start(); rec.abort();
  await tick(); await tick(); await tick();
  assert.equal(plugin.listenerCount(), 0);
  assert.equal(plugin.started, 0, 'no arranca si ya se abortó');
}

// 5) permiso denegado al iniciar -> error "not-allowed" y fin
{
  const plugin = fakePlugin(); plugin.start = async () => { throw new Error('Missing permission'); };
  const t = fakeTimers(), SR = createSpeechRecognition(plugin, t);
  const rec = new SR(); let err = null, ended = 0;
  rec.onerror = (e) => { err = e.error; }; rec.onend = () => ended++;
  rec.start(); await tick(); await tick(); await tick();
  assert.equal(err, 'not-allowed'); assert.equal(ended, 1); assert.equal(plugin.listenerCount(), 0);
}

// 6) empezar dos veces seguidas sin terminar es un error, como en la Web Speech API
{
  const plugin = fakePlugin(), t = fakeTimers(), SR = createSpeechRecognition(plugin, t);
  const rec = new SR(); rec.start();
  assert.throws(() => rec.start(), /already started/);
  rec.abort();
}

// 7) permisos
{
  const mk = (cur, req) => ({ checkPermissions: async () => ({ speechRecognition: cur }), requestPermissions: async () => ({ speechRecognition: req }), available: async () => ({ available: true }) });
  assert.equal(await createMicPermissions(mk('granted')).state(), 'granted');
  assert.equal(await createMicPermissions(mk('denied')).state(), 'denied');
  assert.equal(await createMicPermissions(mk('prompt-with-rationale')).state(), 'prompt');
  assert.equal(await createMicPermissions(mk('prompt', 'granted')).request(), 'granted');
  assert.equal(await createMicPermissions(mk('prompt', 'denied')).request(), 'denied');
  const boom = { checkPermissions: async () => { throw new Error('x'); }, requestPermissions: async () => { throw new Error('x'); }, available: async () => { throw new Error('x'); } };
  assert.equal(await createMicPermissions(boom).state(), 'prompt');
  assert.equal(await createMicPermissions(boom).request(), 'denied');
  assert.equal(await createMicPermissions(boom).available(), false);
}
console.log('speech-adapter OK (7 casos)');
