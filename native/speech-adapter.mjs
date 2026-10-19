// Adaptador: hace que el plugin nativo de voz de Android (Capacitor) se use igual que la
// Web Speech API (start / abort / onresult / onerror / onend), así app.js no cambia.
//
// Particularidades del plugin que este adaptador resuelve:
//  - En modo "partialResults" el resultado final llega como un evento más, DESPUÉS de "stopped".
//  - En ese modo los errores (sin coincidencia, silencio) no se avisan: se detectan consultando isListening().
//  - Los oyentes son globales: hay que quitarlos al terminar cada sesión.

const GRACE_MS = 900;      // espera tras "terminó de hablar" para recibir el resultado final
const POLL_MS = 350;       // cada cuánto se revisa si el reconocedor sigue activo

export function createSpeechRecognition(plugin, timers = { setTimeout, clearTimeout, setInterval, clearInterval }) {
  return class NativeSpeechRecognition {
    constructor() {
      this.lang = 'es-MX';
      this.interimResults = true;
      this.continuous = false;
      this.maxAlternatives = 5;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this._running = false;
      this._handles = [];
      this._last = null;
      this._graceTimer = null;
      this._poll = null;
    }

    start() {
      if (this._running) throw new Error('already started');
      this._running = true;
      this._last = null;
      this._begin().catch((e) => this._fail(e));
    }

    async _begin() {
      const h1 = await plugin.addListener('partialResults', (d) => this._partial(d));
      const h2 = await plugin.addListener('listeningState', (d) => { if (d && d.status === 'stopped') this._armGrace(); });
      this._handles = [h1, h2];
      if (!this._running) return this._cleanup();           // se abortó mientras se preparaba
      await plugin.start({
        language: this.lang,
        maxResults: this.maxAlternatives,
        partialResults: true,
        popup: false,
      });
      // El plugin no avisa errores en este modo: se vigila si sigue escuchando.
      this._poll = timers.setInterval(async () => {
        if (!this._running) return;
        try {
          const { listening } = await plugin.isListening();
          if (!listening) this._armGrace();
        } catch (_) { /* ignorar */ }
      }, POLL_MS);
    }

    _partial(data) {
      if (!this._running || !data || !data.matches || !data.matches.length) return;
      this._last = data.matches.slice(0, this.maxAlternatives);
      if (this._graceTimer) this._armGrace(true);            // llegó algo durante la espera: reiniciarla
      if (this.interimResults && this.onresult) this.onresult(this._event(this._last, false));
    }

    _armGrace(reset) {
      if (!this._running) return;
      if (this._graceTimer && !reset) return;
      if (this._graceTimer) timers.clearTimeout(this._graceTimer);
      this._graceTimer = timers.setTimeout(() => this._finish(), reset ? GRACE_MS / 2 : GRACE_MS);
    }

    _event(matches, isFinal) {
      const res = matches.map((t) => ({ transcript: t, confidence: 1 }));
      res.isFinal = isFinal;
      return { results: [res], resultIndex: 0 };
    }

    _finish() {
      if (!this._running) return;
      this._running = false;
      const last = this._last;
      this._cleanup();
      if (last && this.onresult) this.onresult(this._event(last, true));
      if (this.onend) this.onend();
    }

    _fail(err) {
      if (!this._running) return;
      this._running = false;
      this._cleanup();
      const msg = String((err && (err.message || err)) || '');
      const denied = /permission|denied|not.?allowed/i.test(msg);
      if (this.onerror) this.onerror({ error: denied ? 'not-allowed' : 'audio-capture', message: msg });
      if (this.onend) this.onend();
    }

    abort() {
      const was = this._running;
      this._running = false;
      this._cleanup();
      if (was) {
        Promise.resolve().then(() => plugin.stop()).catch(() => {});
        if (this.onend) timers.setTimeout(() => this.onend && this.onend(), 0);
      }
    }
    stop() { this.abort(); }

    _cleanup() {
      if (this._graceTimer) { timers.clearTimeout(this._graceTimer); this._graceTimer = null; }
      if (this._poll) { timers.clearInterval(this._poll); this._poll = null; }
      const hs = this._handles; this._handles = [];
      hs.forEach((h) => { try { h && h.remove && h.remove(); } catch (_) { /* ya quitado */ } });
    }
  };
}

// Permisos del micrófono con la misma forma que usa la app ('granted' | 'denied' | 'prompt').
export function createMicPermissions(plugin) {
  const map = (s) => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt');
  return {
    async state() { try { return map((await plugin.checkPermissions()).speechRecognition); } catch (_) { return 'prompt'; } },
    async request() {
      try { return (await plugin.requestPermissions()).speechRecognition === 'granted' ? 'granted' : 'denied'; }
      catch (_) { return 'denied'; }
    },
    async available() { try { return !!(await plugin.available()).available; } catch (_) { return false; } },
  };
}
