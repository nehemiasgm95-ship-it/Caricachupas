// Efectos de sonido generados con Web Audio (sin archivos): aplausos, lamento y cuenta regresiva.
(function (root) {
  const CLAP_MS = 1300;
  const SAD_MS = 2000;
  let ctx = null;
  let enabled = true;

  function unlock() {
    try {
      ctx = ctx || new (root.AudioContext || root.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) { ctx = null; }
    return ctx;
  }

  function noise(c, seconds) {
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Muchas palmadas cortas (ruido filtrado) que crecen y se apagan: suena a público aplaudiendo.
  function scheduleClap(c, t0, dest) {
    const buf = noise(c, 0.09);
    const N = 70;
    for (let i = 0; i < N; i++) {
      const x = i / N;
      const t = t0 + Math.pow(x, 0.85) * (CLAP_MS / 1000 - 0.15) + Math.random() * 0.025;
      const swell = Math.sin(Math.PI * Math.min(1, 0.08 + x * 0.92));
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100 + Math.random() * 2800;
      bp.Q.value = 0.9;
      const g = c.createGain();
      const peak = 0.32 * swell * (0.45 + Math.random() * 0.55);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.075);
      src.connect(bp); bp.connect(g); g.connect(dest);
      src.start(t);
    }
  }

  // "Wah wah wah wahhh" de trombón triste: notas que bajan con vibrato en la última.
  function scheduleSad(c, t0, dest) {
    const notes = [
      { f: 311, d: 0.34 }, { f: 294, d: 0.34 }, { f: 277, d: 0.34 }, { f: 262, d: 0.95 },
    ];
    let t = t0;
    notes.forEach((n, i) => {
      const last = i === notes.length - 1;
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, t);
      osc.frequency.exponentialRampToValueAtTime(n.f * (last ? 0.82 : 0.96), t + n.d);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + n.d);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.04);
      g.gain.setValueAtTime(0.28, t + n.d - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0005, t + n.d);
      if (last) {
        const lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = 6;
        lg.gain.value = 9;
        lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t); lfo.stop(t + n.d);
      }
      osc.connect(lp); lp.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + n.d + 0.02);
      t += n.d + 0.02;
    });
  }

  function scheduleTone(c, t0, dest, freq, ms, vol) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + ms / 1000);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
  }

  function play(fn) {
    if (!enabled) return;
    const c = unlock();
    if (!c) return;
    try { fn(c, c.currentTime + 0.02, c.destination); } catch (_) { /* sin audio */ }
  }

  root.CCSfx = {
    CLAP_MS, SAD_MS,
    unlock,
    setEnabled(v) { enabled = !!v; },
    clap() { play(scheduleClap); },
    sad() { play(scheduleSad); },
    click() { play((c, t, d) => scheduleTone(c, t, d, 1400, 35, 0.12)); },
    tick() { play((c, t, d) => scheduleTone(c, t, d, 660, 90, 0.15)); },
    ding() { play((c, t, d) => { scheduleTone(c, t, d, 880, 140, 0.18); scheduleTone(c, t + 0.1, d, 1320, 200, 0.14); }); },
    // Para pruebas: renderiza un efecto en un contexto sin conexión.
    _schedule: { clap: scheduleClap, sad: scheduleSad },
  };
})(typeof self !== 'undefined' ? self : this);
