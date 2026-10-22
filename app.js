(function () {
  const { LETTERS, CATEGORIES, DIFFICULTIES, PUNISHMENTS, RETOS, PROGRESSION } = CCData;
  const { evaluate, buildIndex, rankedLetters, lettersForRange, meetsReto, retoFeasible, scoreFor, stageFor, canonical, clean } = CCLogic;
  const Sfx = CCSfx;
  const Wheel = CCWheel;

  const $ = (id) => document.getElementById(id);
  // En la app Android existen window.CCNativeSR / CCNative / CCAds (ver native/); en la web no.
  const NATIVE = !!window.CCNative;
  const SR = window.CCNativeSR || window.SpeechRecognition || window.webkitSpeechRecognition;
  const NO_ADS = {
    onScreen() {}, async beforeNextTopic() { return false; }, canReward() { return false; },
    async showReward() { return false; }, privacyOptionsRequired: false, async openPrivacyOptions() {},
  };
  const Ads = () => window.CCAds || NO_ADS;
  const STORE_KEY = 'caricachupas.v1';
  const REJECTED_KEY = 'caricachupas.rejected.v1';
  const LEARNED_KEY = 'caricachupas.learned.v1';
  const RECORDS_KEY = 'caricachupas.records.v1';
  const CLAIMS_KEY = 'caricachupas.claims.v1';
  const MINE_KEY = 'caricachupas.mine.v1';          // temas creados por el grupo
  const TUTORIAL_KEY = 'caricachupas.tutorial.v1';
  const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🐵', '🦄', '🐯', '🐶', '🐱', '🐰', '🐨'];
  const RING_LEN = 2 * Math.PI * 52;
  const NEXT_TURN_MS = 1100;   // deja que termine el aplauso antes de abrir el micrófono
  const RETO_CHANCE = 0.4;     // probabilidad de reto sorpresa por tema (desde el 2.º)
  const JOKER_SECONDS = 4;
  const LIVES = 3;             // vidas por equipo en modo equipos + "pierde vida"
  const TEAM_DEFS = [
    { name: 'Rojo', emoji: '🔴', hue: 5 },
    { name: 'Azul', emoji: '🔵', hue: 215 },
  ];
  const REVEAL_MS = 1500;      // sin voz: tiempo que se ve el tema antes de arrancar el reloj
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- estado ----------
  const state = {
    players: [],            // { name, alive, avatar, hue }
    settings: { seconds: 5, mode: 'eliminar', lang: 'es-MX', voice: true, sound: true, difficulty: 'medio', laps: 0, auto: true, retos: true, teams: false, warmMic: false, progressive: true, autoNext: true, claims: true, speedup: true, onlyMine: false, customPunishments: [] },
    micOk: false,           // false = se juega sin voz (botones ✔ / ✘)
    round: 0,
    topic: null,            // { category, letter, index, used:Map(clave->palabra), turns }
    recentCats: [],
    reto: null,             // reto sorpresa del tema actual
    lastReto: null,
    dir: 1,                 // 1 = orden normal, -1 = al revés
    forceReto: null,        // solo para pruebas
    stage: { free: false, diffKey: 'medio', stepsUp: 0 },   // etapa del tema actual (libre / dificultad)
    lastFail: null,         // último fallo (para poder reclamarlo)
    paused: false,
    endToken: 0,            // invalida narraciones pendientes al cambiar de pantalla
    nextAction: null,
    game: null,             // resumen de la partida: { topics, words, longest, best:{ name, n }, elims }
    mine: [],               // temas propios: [{ id, name, words:[...] }]
    learned: {},            // palabras que el grupo aceptó por reclamo: { idTema: [palabras] }
    teams: null,            // [{ name, emoji, hue, score, lives }] en modo equipos
    current: 0,
    turnOpen: false,
  };

  function resetStats(p) {
    p.alive = true; p.score = 0; p.correct = 0; p.fails = 0; p.streak = 0; p.best = 0; p.fastest = null;
    p.jokers = { time: 1, pass: 1 };
    return p;
  }
  function decorate(name, i) {
    return resetStats({ name, avatar: AVATARS[i % AVATARS.length], hue: (i * 47 + 250) % 360, team: i % 2 });
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        players: state.players.map((p) => p.name),
        settings: state.settings,
      }));
    } catch (_) { /* sin almacenamiento: no pasa nada */ }
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!raw) return;
      state.players = (raw.players || []).map(decorate);
      Object.assign(state.settings, raw.settings || {});
    } catch (_) { /* ignorar datos corruptos */ }
  }

  // Palabras que el juez rechazó: sirven para ampliar las listas de cada tema.
  function readRejected() {
    try { return JSON.parse(localStorage.getItem(REJECTED_KEY) || '[]'); } catch (_) { return []; }
  }
  function logRejected(entry) {
    const list = readRejected();
    list.push(entry);
    try { localStorage.setItem(REJECTED_KEY, JSON.stringify(list.slice(-100))); } catch (_) { /* sin almacenamiento */ }
  }
  // ---------- mis temas: listas que escribe el grupo; se juegan sin letra ----------
  const MINE_MIN = 8, MINE_MAX_WORDS = 300, MINE_MAX = 20;
  function loadMine() {
    try { const a = JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); state.mine = Array.isArray(a) ? a : []; } catch (_) { state.mine = []; }
  }
  function saveMine() { try { localStorage.setItem(MINE_KEY, JSON.stringify(state.mine)); } catch (_) { /* sin almacenamiento */ } }
  // "grapadora, impresora; café" -> ['grapadora', 'impresora', 'café'] (sin repetidas)
  function parseWords(text) {
    const seen = new Set(), out = [];
    String(text).split(/[,;\n]+/).map((w) => w.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach((w) => {
      const k = canonical(w);
      if (k && !seen.has(k)) { seen.add(k); out.push(w.slice(0, 40)); }
    });
    return out.slice(0, MINE_MAX_WORDS);
  }
  const mineCategories = () => state.mine.map((m) => ({ id: m.id, name: m.name, emoji: '📝', level: 1, list: m.words, mine: true, warmup: true }));

  const fmtWord = (r) => `${r.topic}${r.letter ? ' (' + r.letter + ')' : ''}: ${r.said}`;
  // Reclamos votados por el grupo (sirven para ampliar las listas).
  function readClaims() { try { return JSON.parse(localStorage.getItem(CLAIMS_KEY) || '[]'); } catch (_) { return []; } }
  function logClaim(entry) {
    const list = readClaims(); list.push(entry);
    try { localStorage.setItem(CLAIMS_KEY, JSON.stringify(list.slice(-100))); } catch (_) { /* sin almacenamiento */ }
  }
  // Palabras que el grupo aceptó: la app las recuerda en este teléfono y ya no las vuelve a rechazar.
  function loadLearned() { try { state.learned = JSON.parse(localStorage.getItem(LEARNED_KEY) || '{}') || {}; } catch (_) { state.learned = {}; } }
  function saveLearned() { try { localStorage.setItem(LEARNED_KEY, JSON.stringify(state.learned)); } catch (_) { /* sin almacenamiento */ } }
  const loadRecords = () => { try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const recordOf = (catId) => +loadRecords()[catId] || 0;
  // Guarda el récord de palabras seguidas de un tema; devuelve true si se rompió (había uno previo).
  function saveRecord(catId, n) {
    const r = loadRecords(); const prev = +r[catId] || 0;
    if (n <= prev) return false;
    r[catId] = n;
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch (_) { /* sin almacenamiento */ }
    return prev > 0;
  }
  const learnedCount = () => Object.values(state.learned).reduce((n, a) => n + a.length, 0);
  function renderLearned() {
    const n = learnedCount();
    $('learned-box').hidden = n === 0;
    $('learned-count').textContent = n;
  }
  function renderRejected() {
    renderLearned();
    const list = readRejected();
    $('rejected-box').hidden = list.length === 0;
    $('rejected-count').textContent = list.length;
    const ul = $('rejected-list');
    ul.innerHTML = '';
    list.slice().reverse().forEach((r) => {
      const li = document.createElement('li');
      li.textContent = fmtWord(r).replace(': ', ': “') + '”';
      ul.appendChild(li);
    });
  }

  // ---------- pantallas y efectos ----------
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
    if (name !== 'round-end') cancelAutoNext();
    if (name === 'setup') maybeTutorial();
    try {
      Promise.resolve(Ads().onScreen(name)).catch(() => {});
      if (name === 'round-end') $('btn-reward').hidden = !Ads().canReward();
      if (name === 'setup') $('btn-adprivacy').hidden = !Ads().privacyOptionsRequired;
    } catch (_) { /* un anuncio nunca debe romper el juego */ }
  }
  // ---------- tutorial: 4 tarjetas la primera vez (y desde "¿Cómo se juega?") ----------
  const TUTORIAL = [
    { e: '🎤', t: 'Di tu respuesta en voz alta', d: 'Sale un tema, por ejemplo “Frutas”. En tu turno, di una antes de que se acabe el tiempo.' },
    { e: '🧑‍⚖️', t: 'La app es el juez', d: 'Si vale: aplausos y puntos. Si se acaba el tiempo, repites o no vale… ¡quedas fuera!' },
    { e: '✋', t: '¿No te la aceptó?', d: 'Toca “Reclamar” y los demás votan. Si gana el sí, vuelves al juego.' },
    { e: '🏆', t: 'Gana el último en pie', d: 'Empieza fácil y sin letra. Luego llega la letra, sube la dificultad y el tiempo baja.' },
  ];
  let tutIdx = 0;
  function maybeTutorial() {
    let seen = true;
    try { seen = !!localStorage.getItem(TUTORIAL_KEY); } catch (_) { /* sin almacenamiento: no molestar */ }
    if (!seen) openTutorial();
  }
  function openTutorial() { tutIdx = 0; renderTutorial(); $('tutorial').hidden = false; }
  function closeTutorial() {
    $('tutorial').hidden = true;
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (_) { /* sin almacenamiento */ }
  }
  function renderTutorial() {
    const c = TUTORIAL[tutIdx];
    $('tut-emoji').textContent = c.e;
    $('tut-title').textContent = c.t;
    $('tut-text').textContent = c.d;
    $('tut-dots').textContent = TUTORIAL.map((_, i) => (i === tutIdx ? '●' : '○')).join(' ');
    const lastCard = tutIdx === TUTORIAL.length - 1;
    $('tut-next').textContent = lastCard ? '¡A jugar! 🎉' : 'Siguiente ▶';
    $('tut-skip').hidden = lastCard;
    pop($('tut-emoji'));
  }
  function initTutorial() {
    $('tut-next').onclick = () => { if (tutIdx >= TUTORIAL.length - 1) closeTutorial(); else { tutIdx += 1; renderTutorial(); } };
    $('tut-skip').onclick = closeTutorial;
    $('btn-howto').onclick = openTutorial;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
  }
  function buzz(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }
  function setAvatar(el, p) {
    el.textContent = p.avatar;
    el.style.setProperty('--hue', p.hue);
    const ringed = state.settings.teams && p.team != null;
    el.classList.toggle('team-ring', !!ringed);
    if (ringed) el.style.setProperty('--ring', TEAM_DEFS[p.team].hue);
  }
  const hearts = (t) => '❤️'.repeat(Math.max(0, t.lives)) + '🖤'.repeat(Math.max(0, LIVES - t.lives));

  function confetti(count) {
    if (REDUCED) return;
    const fx = $('fx');
    const colors = ['#ffd23f', '#ff4d6d', '#2ecc71', '#4dabf7', '#f783ac', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      c.style.setProperty('--rot', (Math.random() * 900 + 200) + 'deg');
      c.style.setProperty('--dur', (1.4 + Math.random() * 1.2) + 's');
      c.style.setProperty('--delay', Math.random() * 0.35 + 's');
      fx.appendChild(c);
      setTimeout(() => c.remove(), 3200);
    }
  }
  function shake() {
    const app = $('app');
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
    setTimeout(() => app.classList.remove('shake'), 600);
  }
  function pop(el) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!state.settings.voice || !('speechSynthesis' in window)) return resolve();
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = state.settings.lang;
        u.rate = 1.05;
        const done = () => resolve();
        u.onend = done; u.onerror = done;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        setTimeout(done, 6000); // red de seguridad si el navegador nunca avisa
      } catch (_) { resolve(); }
    });
  }

  // ---------- micrófono: se pide al abrir la app ----------
  async function micPermission() {
    if (NATIVE) return { state: await window.CCNative.mic.state(), onchange: null };
    try {
      const st = await navigator.permissions.query({ name: 'microphone' });
      return st; // PermissionStatus
    } catch (_) { return null; }
  }
  async function requestMic() {
    if (NATIVE) return window.CCNative.mic.request();      // 'granted' | 'denied'
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unsupported';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // solo era para obtener el permiso
      return 'granted';
    } catch (e) {
      return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error';
    }
  }
  function setWelcome(stateName) { $('screen-welcome').dataset.state = stateName; }
  function enterSetup(micOk) {
    state.micOk = micOk;
    $('manual-judge').hidden = micOk;
    renderPlayers();
    renderRejected();
    show('setup');
  }

  async function onMicClick() {
    Sfx.unlock();
    const r = await requestMic();
    if (r === 'granted') return enterSetup(true);
    setWelcome(r === 'denied' ? 'denied' : 'unsupported');
    $('btn-no-mic').hidden = false;
  }

  async function initWelcome() {
    $('btn-mic').onclick = onMicClick;
    $('btn-mic-retry').onclick = onMicClick;
    $('btn-no-mic').onclick = () => { Sfx.unlock(); enterSetup(false); };

    if (!SR || (!NATIVE && !navigator.mediaDevices)) {
      setWelcome('unsupported');
      $('btn-no-mic').hidden = false;
      return;
    }
    const perm = await micPermission();
    if (perm) {
      if (perm.state === 'granted') return enterSetup(true);
      if (perm.state === 'denied') { setWelcome('denied'); $('btn-no-mic').hidden = false; }
      // Si la persona lo permite desde los ajustes del navegador, avanzar solita.
      perm.onchange = () => {
        if (perm.state === 'granted' && $('screen-welcome').classList.contains('active')) enterSetup(true);
      };
    }
  }

  // ---------- configuración ----------
  function renderPlayers() {
    const box = $('player-list');
    box.innerHTML = '';
    if (!state.players.length) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = '👥 Añade al menos 2 jugadores';
      box.appendChild(p);
    }
    state.players.forEach((pl, i) => {
      const chip = document.createElement('div');
      chip.className = 'player-chip' + (state.settings.teams ? ' t' + pl.team : '');
      if (state.settings.teams) {
        chip.title = 'Tocar para cambiar de equipo';
        chip.onclick = () => { pl.team = 1 - pl.team; renderPlayers(); };
      }
      const av = document.createElement('span');
      av.className = 'avatar';
      setAvatar(av, pl);
      const name = document.createElement('span');
      name.textContent = pl.name;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '✕';
      rm.setAttribute('aria-label', 'Quitar ' + pl.name);
      rm.onclick = (ev) => {
        ev.stopPropagation();
        state.players.splice(i, 1);
        state.players.forEach((p, k) => { p.avatar = AVATARS[k % AVATARS.length]; p.hue = (k * 47 + 250) % 360; });
        save(); renderPlayers();
      };
      chip.append(av, name, rm);
      box.appendChild(chip);
    });
    $('btn-play').disabled = state.players.length < 2;
  }

  // Grupo de botones tipo "radio" con emojis.
  function bindSeg(id, getValue, onChange) {
    const seg = $(id);
    const paint = () => seg.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.value === String(getValue())));
    });
    seg.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { onChange(b.dataset.value); paint(); };
    });
    paint();
  }

  function setSeconds(n) {
    state.settings.seconds = n;
    $('seconds').value = n;
    $('seconds-label').textContent = n + ' s';
  }

  function assignTeams(randomize) {
    const idx = state.players.map((_, i) => i);
    if (randomize) shuffle(idx);
    idx.forEach((pi, k) => { state.players[pi].team = k % 2; });
  }
  function applyMode() {
    const auto = state.settings.auto;
    $('teams-hint').hidden = !state.settings.teams;
    $('lbl-sale').textContent = state.settings.teams ? 'Vidas' : 'Sale';
    $('manual-settings').hidden = auto;
    $('auto-note').hidden = !auto;
    $('btn-play').textContent = auto ? '🎰 ¡Girar ruleta!' : '▶ ¡Jugar!';
  }

  function renderPunishments() {
    const ul = $('pun-list');
    ul.innerHTML = '';
    state.settings.customPunishments.forEach((t, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = '😈 ' + t;
      const rm = document.createElement('button');
      rm.type = 'button'; rm.textContent = '✕'; rm.setAttribute('aria-label', 'Quitar castigo');
      rm.onclick = () => { state.settings.customPunishments.splice(i, 1); save(); renderPunishments(); };
      li.append(span, rm);
      ul.appendChild(li);
    });
  }
  function renderMine() {
    const ul = $('mine-list');
    ul.innerHTML = '';
    state.mine.forEach((m, i) => {
      const li = document.createElement('li');
      const span = document.createElement('button');
      span.type = 'button'; span.className = 'mine-name';
      span.textContent = `📝 ${m.name} · ${m.words.length}`;
      span.setAttribute('aria-label', 'Editar ' + m.name);
      span.onclick = () => { $('mine-name').value = m.name; $('mine-words').value = m.words.join(', '); $('mine-name').focus(); };
      const rm = document.createElement('button');
      rm.type = 'button'; rm.textContent = '✕'; rm.setAttribute('aria-label', 'Borrar tema ' + m.name);
      rm.onclick = () => { indexCache.delete(m.id); state.mine.splice(i, 1); saveMine(); renderMine(); };
      li.append(span, rm);
      ul.appendChild(li);
    });
    $('onlymine-line').hidden = state.mine.length === 0;
  }
  function submitMine(e) {
    e.preventDefault();
    const name = $('mine-name').value.trim().replace(/\s+/g, ' ').slice(0, 40);
    const list = parseWords($('mine-words').value);
    if (!name) { toast('Ponle nombre al tema'); return; }
    if (list.length < MINE_MIN) { toast(`Escribe al menos ${MINE_MIN} palabras (llevas ${list.length})`); return; }
    const prev = state.mine.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!prev && state.mine.length >= MINE_MAX) { toast(`Máximo ${MINE_MAX} temas`); return; }
    if (prev) { prev.name = name; prev.words = list; indexCache.delete(prev.id); }
    else state.mine.push({ id: 'mio_' + Date.now().toString(36), name, words: list });
    saveMine(); renderMine();
    $('mine-name').value = ''; $('mine-words').value = '';
    toast(prev ? `✏️ “${name}” actualizado` : `📝 “${name}” guardado con ${list.length} palabras`);
  }

  function allPunishments() {
    return PUNISHMENTS.concat(state.settings.customPunishments.map((text) => ({ emoji: '😈', text })));
  }

  function initSetup() {
    load();
    setSeconds(state.settings.seconds);
    $('lang').value = state.settings.lang;
    $('voice').checked = state.settings.voice;
    $('sound').checked = state.settings.sound;
    $('retos').checked = state.settings.retos;
    $('warmmic').checked = state.settings.warmMic;
    $('progressive').checked = state.settings.progressive;
    $('autonext').checked = state.settings.autoNext;
    $('speedup').checked = state.settings.speedup;
    $('claims').checked = state.settings.claims;
    renderPunishments();
    Sfx.setEnabled(state.settings.sound);

    bindSeg('seg-auto', () => (state.settings.auto ? 'auto' : 'manual'), (v) => {
      state.settings.auto = v === 'auto';
      applyMode(); save();
    });
    bindSeg('seg-teams', () => (state.settings.teams ? 'teams' : 'solo'), (v) => {
      state.settings.teams = v === 'teams';
      applyMode(); renderPlayers(); save();
    });
    $('btn-shuffle-teams').onclick = () => { assignTeams(true); renderPlayers(); Sfx.click(); };
    applyMode();
    bindSeg('seg-difficulty', () => state.settings.difficulty, (v) => {
      state.settings.difficulty = v;
      setSeconds(DIFFICULTIES[v].seconds); // cada nivel sugiere un tiempo; se puede ajustar a mano
      save();
    });
    bindSeg('seg-laps', () => state.settings.laps, (v) => { state.settings.laps = +v; save(); });
    bindSeg('seg-mode', () => state.settings.mode, (v) => { state.settings.mode = v; save(); });

    $('player-form').onsubmit = (e) => {
      e.preventDefault();
      const input = $('player-name');
      const name = input.value.trim();
      if (!name || state.players.length >= 12) return;
      const added = decorate(name, state.players.length);
      // El jugador nuevo entra al equipo con menos gente.
      added.team = state.players.filter((q) => q.team === 0).length <= state.players.filter((q) => q.team === 1).length ? 0 : 1;
      state.players.push(added);
      input.value = '';
      save(); renderPlayers();
    };
    $('seconds').oninput = (e) => { setSeconds(+e.target.value); save(); };
    $('lang').onchange = (e) => { state.settings.lang = e.target.value; save(); };
    $('voice').onchange = (e) => { state.settings.voice = e.target.checked; save(); };
    $('sound').onchange = (e) => { state.settings.sound = e.target.checked; Sfx.setEnabled(e.target.checked); save(); };
    $('retos').onchange = (e) => { state.settings.retos = e.target.checked; save(); };
    $('progressive').onchange = (e) => { state.settings.progressive = e.target.checked; save(); };
    $('speedup').onchange = (e) => { state.settings.speedup = e.target.checked; save(); };
    $('autonext').onchange = (e) => { state.settings.autoNext = e.target.checked; save(); };
    $('claims').onchange = (e) => { state.settings.claims = e.target.checked; save(); };
    $('learned-clear').onclick = () => {
      state.learned = {}; indexCache.clear(); saveLearned(); renderLearned(); toast('Listo: la app olvidó esas palabras');
    };
    $('warmmic').onchange = (e) => { state.settings.warmMic = e.target.checked; closeMic(); save(); };
    $('btn-mictest').onclick = () => { show('mictest'); };
    $('pun-form').onsubmit = (e) => {
      e.preventDefault();
      const text = $('pun-text').value.trim();
      if (!text || state.settings.customPunishments.length >= 20) return;
      state.settings.customPunishments.push(text);
      $('pun-text').value = '';
      save(); renderPunishments();
    };
    $('mine-form').onsubmit = submitMine;
    $('onlymine').checked = state.settings.onlyMine;
    $('onlymine').onchange = (e) => { state.settings.onlyMine = e.target.checked; save(); };
    renderMine();
    $('btn-play').onclick = startFlow;
    $('rejected-clear').onclick = () => {
      try { localStorage.removeItem(REJECTED_KEY); } catch (_) {}
      renderRejected();
    };
    $('rejected-copy').onclick = async () => {
      const text = readRejected().map(fmtWord).join('\n');
      try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch (_) { toast('No pude copiar'); }
    };
  }

  // ---------- flujo del juego ----------
  function alive() { return state.players.map((p, i) => ({ p, i })).filter((x) => x.p.alive); }
  function nextAlive(from) {
    const n = state.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k * state.dir) % n) + n) % n;
      if (state.players[i].alive) return i;
    }
    return from;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function interleave(players) {
    const t = [[], []];
    players.forEach((p) => t[p.team].push(p));
    shuffle(t[0]); shuffle(t[1]);
    const first = Math.random() < 0.5 ? 0 : 1;
    const a = t[first], b = t[1 - first], out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) out.push(a[i]);
      if (b[i]) out.push(b[i]);
    }
    return out;
  }

  // Presenta los equipos y espera un toque.
  async function showTeams() {
    const box = $('team-cards');
    box.innerHTML = '';
    state.teams.forEach((tm, ti) => {
      const card = document.createElement('div');
      card.className = 'team-card';
      card.style.setProperty('--hue', tm.hue);
      const em = document.createElement('div'); em.className = 'big'; em.textContent = tm.emoji;
      const h = document.createElement('h2'); h.textContent = 'Equipo ' + tm.name;
      card.append(em, h);
      state.players.filter((p) => p.team === ti).forEach((p) => {
        const m = document.createElement('div'); m.className = 'member';
        const av = document.createElement('span'); av.className = 'avatar'; setAvatar(av, p);
        const nm = document.createElement('span'); nm.textContent = p.name;
        m.append(av, nm);
        card.appendChild(m);
      });
      box.appendChild(card);
    });
    show('teams');
    Sfx.ding();
    await new Promise((res) => { $('btn-teams-go').onclick = res; });
  }

  // Muestra una ruleta, espera el giro y devuelve el índice ganador.
  async function runWheel({ title, items, tap, result }) {
    $('wheel-title').textContent = title;
    const svg = $('wheel');
    Wheel.build(svg, items);
    $('wheel-result').innerHTML = '&nbsp;';
    const btn = $('btn-spin');
    btn.hidden = !tap;
    btn.disabled = false;
    show('wheel');
    if (tap) await new Promise((res) => { btn.onclick = () => { btn.disabled = true; res(); }; });
    else await wait(700);
    Sfx.unlock();
    btn.hidden = true;
    const idx = await Wheel.spin(svg, items.length, { onTick: () => Sfx.click() });
    $('wheel-result').textContent = result(idx);
    Sfx.ding(); buzz(60);
    confetti(24);
    pop($('wheel-result'));
    await wait(1400);
    return idx;
  }

  // Inicio: [ruleta de dificultad] -> ruleta de quién empieza -> el tema arranca solo.
  async function startFlow() {
    Sfx.unlock();
    keepAwake();
    state.players.forEach(resetStats);
    state.reto = null; state.lastReto = null; state.dir = 1;
    state.round = 0;
    state.game = { topics: 0, words: 0, longest: '', best: null, elims: 0 };
    if (state.settings.teams) {
      // Equipos: turnos alternados rojo-azul-rojo-azul...
      if (!state.players.some((p) => p.team === 0) || !state.players.some((p) => p.team === 1)) assignTeams(true);
      state.teams = TEAM_DEFS.map((d) => ({ ...d, score: 0, lives: LIVES }));
      state.players = interleave(state.players);
      await showTeams();
    } else {
      state.teams = null;
      shuffle(state.players);             // el orden de turnos también es aleatorio
    }

    if (state.settings.auto) {
      const keys = Object.keys(DIFFICULTIES);
      const icons = { facil: '😀', medio: '🙂', dificil: '😬', extremo: '🔥' };
      const items = keys.map((k) => ({ emoji: icons[k], label: DIFFICULTIES[k].label }));
      const di = await runWheel({
        title: '¿Qué dificultad?', items, tap: true,
        result: (i) => `${icons[keys[i]]} ${DIFFICULTIES[keys[i]].label}`,
      });
      state.settings.difficulty = keys[di];
      setSeconds(DIFFICULTIES[keys[di]].seconds);
      save();
    }

    const si = await runWheel({
      title: '¿Quién empieza?',
      items: state.players.map((p) => ({ emoji: p.avatar, label: p.name })),
      tap: false,
      result: (i) => `${state.players[i].avatar} ${state.players[i].name} empieza`,
    });
    newRound(si);
  }

  // Quien abre cada tema nuevo es aleatorio (entre los que siguen en juego).
  function randomStarter() {
    const ids = alive().map((x) => x.i);
    const pool = ids.length >= 3 ? ids.filter((i) => i !== state.current) : ids;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const indexCache = new Map();
  function indexFor(category) {
    if (!indexCache.has(category.id)) {
      indexCache.set(category.id, buildIndex(category.list.concat(state.learned[category.id] || [])));
    }
    return indexCache.get(category.id);
  }

  // Etapa del tema: la partida empieza LIBRE (sin letra, vale cualquier palabra del tema) y sube de nivel poco a poco.
  function currentStage() {
    return stageFor({ round: state.round, base: state.settings.difficulty, progressive: state.settings.progressive, ...PROGRESSION });
  }

  function pickTopic(stage) {
    const diff = DIFFICULTIES[stage.diffKey] || DIFFICULTIES.medio;
    let pool = stage.free ? CATEGORIES.filter((c) => c.warmup) : CATEGORIES.filter((c) => diff.levels.includes(c.level));
    // Mis temas: solo esos, o de vez en cuando mezclados con los de la app.
    const mine = mineCategories();
    if (mine.length && (state.settings.onlyMine || Math.random() < 0.35)) pool = mine;
    const fresh = pool.filter((c) => !state.recentCats.includes(c.id));
    if (fresh.length) pool = fresh;
    const category = pool[Math.floor(Math.random() * pool.length)];
    state.recentCats = [category.id].concat(state.recentCats).slice(0, 4);

    let letter = null;     // tema libre (o tema propio): sin letra
    if (!stage.free && !category.mine) {
      const letters = lettersForRange(rankedLetters(category.list, LETTERS), diff.letters);
      letter = letters[Math.floor(Math.random() * letters.length)];
    }
    return { category, letter, free: !!stage.free || !!category.mine, index: indexFor(category), used: new Map(), turns: 0 };
  }

  // "Frutas con la letra M" o, en tema libre, solo "Animales de cuatro patas".
  function topicLabel(t) { return t.letter ? `${t.category.name} con la letra ${t.letter}` : t.category.name; }

  // Reto sorpresa: a veces un tema trae una regla especial.
  function pickReto(topic) {
    if (state.forceReto) {
      const r = RETOS.find((x) => x.id === state.forceReto);
      state.forceReto = null;
      return r || null;
    }
    if (!state.settings.retos || state.round < 2 || Math.random() > RETO_CHANCE) return null;
    const pool = RETOS.filter((r) => r.id !== state.lastReto && retoFeasible(r, topic.index, topic.letter));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  // Las rondas largas se aceleran: cada 2 vueltas completas se pierde 1 s (no baja de 3 s).
  function speedSteps() {
    if (!state.settings.speedup || !state.topic) return 0;
    const n = alive().length || 1;
    return Math.floor(Math.floor(state.topic.turns / n) / 2);
  }

  function turnSeconds() {
    const base = Math.max(3, state.settings.seconds - (state.stage ? state.stage.stepsUp : 0) - speedSteps());
    return Math.max(2, base + ((state.reto && state.reto.seconds) || 0));
  }

  function newRound(starterIdx) {
    state.round += 1;
    state.stage = currentStage();
    state.topic = pickTopic(state.stage);
    state.reto = pickReto(state.topic);
    state.lastReto = state.reto ? state.reto.id : null;
    state.dir = state.reto && state.reto.dir ? state.reto.dir : 1;
    state.current = starterIdx == null ? randomStarter() : starterIdx;
    const t = state.topic;
    const diff = DIFFICULTIES[state.stage.diffKey] || DIFFICULTIES.medio;
    $('topic-round').textContent = t.category.mine ? `Tema ${state.round} · Tema de ustedes 📝`
      : t.free ? `Tema ${state.round} · Calentamiento 🔥`
      : `Tema ${state.round} · ${diff.label}${state.stage.stepsUp ? ' ⬆️' : ''}`;
    $('topic-emoji').textContent = t.category.emoji;
    $('topic-name').textContent = t.category.name;
    $('topic-letter').textContent = t.letter || '';
    $('topic-letter').hidden = !t.letter;
    $('topic-free').hidden = !!t.letter;
    setAvatar($('topic-avatar'), state.players[state.current]);
    $('topic-player').textContent = state.players[state.current].name;
    const rt = $('topic-reto');
    rt.hidden = !state.reto;
    if (state.reto) {
      $('topic-reto-name').textContent = `${state.reto.emoji} RETO: ${state.reto.label}`;
      $('topic-reto-text').textContent = state.reto.text;
    }
    show('topic');
    if (t.letter) pop($('topic-letter')); else pop($('topic-free'));
    if (state.reto) { pop(rt); Sfx.ding(); }
    beginRound();
  }

  // El tema se anuncia y el reloj corre enseguida: nadie tiene tiempo extra para pensar.
  async function beginRound() {
    Sfx.unlock();
    const shown = Date.now();
    const r = state.reto;
    await speak('Caricachupas. ' + topicLabel(state.topic) + (state.topic.free ? '. Vale cualquiera.' : '') + (r ? `. Reto: ${r.label}. ${r.text}.` : ''));
    // Con voz, el anuncio ya da el tiempo de verlo; sin voz se deja un momento para leerlo.
    const spoke = state.settings.voice && 'speechSynthesis' in window;
    const rest = (spoke ? 400 : REVEAL_MS + (r ? 900 : 0)) - (Date.now() - shown);
    if (rest > 0) await wait(rest);
    beginTurn();
  }

  // ---------- turno ----------
  let deadline = 0, tickId = null, lastSecond = null;
  function setClock(ms) {
    const total = turnSeconds() * 1000;
    const frac = Math.max(0, Math.min(1, ms / total));
    const sec = Math.max(0, Math.ceil(ms / 1000));
    $('turn-clock').textContent = sec;
    $('ring-fg').style.strokeDashoffset = String(RING_LEN * (1 - frac));
    const ring = $('turn-ring');
    ring.classList.toggle('warn', frac <= 0.4 && sec > 2);
    ring.classList.toggle('danger', sec <= 2);
    if (sec !== lastSecond) {
      lastSecond = sec;
      if (sec > 0 && sec <= 3) { Sfx.tick(); buzz(30); }
    }
  }
  function runTimer(ms) {
    clearInterval(tickId);
    deadline = performance.now() + ms;
    setClock(ms);
    tickId = setInterval(() => {
      const left = deadline - performance.now();
      setClock(left);
      if (left <= 0) timeUp();
    }, 100);
  }
  function stopTimer() { clearInterval(tickId); tickId = null; }

  function setHeard(text, cls) {
    const el = $('turn-heard');
    el.textContent = text;
    el.className = 'heard' + (cls ? ' ' + cls : '');
  }

  function renderUsed() {
    const box = $('turn-used');
    box.innerHTML = '';
    [...state.topic.used.values()].slice(-8).forEach((w) => {
      const s = document.createElement('span');
      s.textContent = w;
      box.appendChild(s);
    });
  }

  function renderTurnStats(player) {
    const tm = state.settings.teams && state.teams ? state.teams[player.team] : null;
    $('turn-score').hidden = !!tm;
    $('turn-team').hidden = !tm;
    if (tm) {
      $('turn-team').style.setProperty('--hue', tm.hue);
      $('turn-team').textContent = `${tm.emoji} ${tm.name} · ⭐ ${tm.score}` + (state.settings.mode === 'eliminar' ? ' · ' + hearts(tm) : '');
    }
    $('turn-score').textContent = '⭐ ' + player.score;
    const st = $('turn-streak');
    st.hidden = player.streak < 2;
    st.textContent = `🔥 x${player.streak}`;
    const rc = $('turn-reto');
    rc.hidden = !state.reto;
    if (state.reto) rc.textContent = `${state.reto.emoji} ${state.reto.label}`;
    $('btn-joker-time').disabled = !player.jokers.time;
    $('btn-joker-pass').disabled = !player.jokers.pass;
  }

  function useTimeJoker() {
    const pl = state.players[state.current];
    if (!state.turnOpen || !pl.jokers.time) return;
    pl.jokers.time -= 1;
    deadline += JOKER_SECONDS * 1000;
    setClock(deadline - performance.now());   // se ve al instante
    Sfx.joker(); buzz(30);
    toast(`⏱️ +${JOKER_SECONDS} s`);
    renderTurnStats(pl);
  }
  function usePassJoker() {
    const pl = state.players[state.current];
    if (!state.turnOpen || !pl.jokers.pass) return;
    pl.jokers.pass -= 1;
    state.turnOpen = false;
    stopTimer(); stopListening();
    Sfx.joker();
    state.topic.turns += 1;
    setHeard('⏭️ Pasó', '');
    renderTurnStats(pl);
    state.current = nextAlive(state.current);
    setTimeout(afterTurn, 800);
  }
  // Tras un acierto o un pase: ¿terminó el tema por vueltas o sigue el siguiente jugador?
  function afterTurn() {
    const laps = state.settings.laps;
    if (laps && state.topic.turns >= laps * alive().length) topicCleared();
    else beginTurn();
  }

  function beginTurn() {
    const player = state.players[state.current];
    const t = state.topic;
    state.turnOpen = true;
    lastSecond = null;
    $('turn-emoji').textContent = t.category.emoji;
    $('turn-topic').textContent = t.category.name;
    $('turn-letter').textContent = t.letter || '';
    $('turn-letter').hidden = !t.letter;
    setAvatar($('turn-avatar'), player);
    $('turn-player').textContent = player.name;
    const laps = state.settings.laps;
    const lapEl = $('turn-lap');
    lapEl.hidden = !laps;
    if (laps) {
      const lap = Math.min(laps, Math.floor(t.turns / alive().length) + 1);
      lapEl.textContent = `🔁 ${lap}/${laps}`;
    }
    const cnt = $('turn-count'), rec = recordOf(t.category.id), said = t.used.size;
    cnt.hidden = said === 0 && !rec;
    cnt.textContent = `🔢 ${said}` + (rec ? ` · récord ${rec}` : '');
    cnt.classList.toggle('hot', rec > 0 && said >= rec);
    const fast = $('turn-fast'); fast.hidden = speedSteps() === 0;
    setHeard(state.micOk ? '🎙️ …' : '', '');
    renderUsed();
    renderTurnStats(player);
    show('turn');
    pop($('turn-avatar'));
    state.turnStart = performance.now();
    runTimer(turnSeconds() * 1000);
    startListening();
  }

  // Reconocedor de voz. Dos modos:
  //  - normal: se abre al empezar cada turno y se cierra al terminar.
  //  - continuo ("warmMic"): se abre una vez por tema y sigue escuchando entre turnos, así no hay
  //    pitido de arranque ni retraso al empezar cada turno. Lo dicho entre turnos se ignora.
  let listener = null;   // modo normal
  let warm = null;       // modo continuo

  function openRecognizer(continuous) {
    const rec = new SR();
    rec.lang = state.settings.lang;
    rec.interimResults = true;
    rec.continuous = continuous;
    rec.maxAlternatives = 5;
    const h = { active: true, skip: 0, len: 0, stop() { h.active = false; try { rec.abort(); } catch (_) {} } };

    rec.onresult = (e) => {
      h.len = e.results.length;
      if (!state.turnOpen || state.paused) return;
      if (continuous && e.results.length - 1 < h.skip) return;   // restos de antes de este turno
      const res = e.results[e.results.length - 1];
      const alts = Array.from(res, (a) => a.transcript);
      if (!alts[0]) return;
      setHeard('🗣️ ' + alts[0], '');
      if (res.isFinal) onFinal(alts);
      else {
        const quick = check(alts[0]);
        if (quick.status === 'valid') acceptAnswer(quick.answer, quick.key);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        h.active = false;
        state.micOk = false;
        $('manual-judge').hidden = false;
        setHeard('🔒 Micrófono bloqueado', 'no');
        toast('Permite el micrófono para jugar con voz');
      }
    };
    rec.onend = () => {
      // El reconocedor se corta solo tras un silencio: reiniciarlo mientras toque escuchar.
      if (h.active && (continuous || state.turnOpen)) {
        h.skip = 0; h.len = 0;
        try { rec.start(); } catch (_) { /* ya iniciado */ }
      }
    };
    try { rec.start(); } catch (_) { setHeard('No pude abrir el micrófono', 'no'); }
    return h;
  }

  function startListening() {
    if (!SR || !state.micOk) return;
    if (state.settings.warmMic) {
      if (warm && warm.active) warm.skip = warm.len;   // ya escuchando: ignorar lo anterior
      else warm = openRecognizer(true);
      return;
    }
    stopListening();
    listener = openRecognizer(false);
  }
  function stopListening() {
    if (warm) warm.skip = warm.len;                    // continuo: queda abierto, solo se ignora
    if (listener) { listener.stop(); listener = null; }
  }
  // Cierra el micrófono del todo (fin de tema, resultados, salir).
  function closeMic() {
    if (warm) { warm.stop(); warm = null; }
    if (listener) { listener.stop(); listener = null; }
  }

  function check(text) {
    const r = evaluate({
      text,
      letter: state.topic.letter,
      index: state.topic.index,
      used: state.topic.used,
    });
    if (r.status === 'valid' && !meetsReto(r.answer, state.reto)) {
      return { ...r, status: 'invalid', code: 'reto', key: '',
        reason: `Reto "${state.reto.label}": ${state.reto.text}. “${r.answer}” no cumple` };
    }
    return r;
  }

  // Resultado final del reconocedor. El juez es la app: prueba todas las
  // alternativas que dio el reconocedor y decide sin preguntar a nadie.
  function onFinal(alts) {
    const results = alts.map(check);
    const good = results.find((r) => r.status === 'valid');
    if (good) return acceptAnswer(good.answer, good.key);
    if (!alts[0].trim()) return; // silencio: sigue escuchando
    if (results[0].code === 'unknown') {
      logRejected({ topic: state.topic.category.name, letter: state.topic.letter, said: alts[0] });
    }
    failTurn(results[0].reason, alts[0], { code: results[0].code });
  }

  function acceptAnswer(answer, key) {
    if (!state.turnOpen) return;
    state.turnOpen = false;
    stopTimer(); stopListening();
    state.topic.used.set(key || ('manual-' + state.topic.used.size), answer || 'respuesta');
    state.topic.turns += 1;
    noteWord(answer);

    // Puntos: base + rapidez + racha, por el multiplicador del reto.
    const pl = state.players[state.current];
    const total = turnSeconds() * 1000;
    const left = Math.max(0, deadline - performance.now());
    pl.streak += 1;
    pl.best = Math.max(pl.best, pl.streak);
    pl.correct += 1;
    const elapsed = performance.now() - state.turnStart;
    if (pl.fastest == null || elapsed < pl.fastest) pl.fastest = elapsed;
    const pts = scoreFor({ fracLeft: left / total, streak: pl.streak, mult: state.reto && state.reto.mult });
    pl.score += pts;
    if (state.teams) state.teams[pl.team].score += pts;

    // ¡Aplausos!
    Sfx.clap(); buzz(40);
    confetti(26);
    setHeard(`👏 ${answer || '¡Correcto!'}  +${pts}`, 'ok');
    pop($('turn-heard'));
    renderUsed();
    renderTurnStats(pl);
    state.current = nextAlive(state.current);
    setTimeout(afterTurn, NEXT_TURN_MS);
  }

  function failTurn(reason, heard, info) {
    if (!state.turnOpen) return;
    state.turnOpen = false;
    stopTimer(); stopListening();
    Sfx.sad(); buzz([200, 80, 200]);
    shake();
    const failer = state.players[state.current];
    failer.fails += 1;
    failer.streak = 0;
    setHeard(heard ? '😢 ' + heard : '⏰', 'no');
    endRound(reason, heard, info || {});
  }
  function timeUp() { failTurn('¡Se acabó el tiempo!', '', { code: 'timeout' }); }

  // ---------- pausa durante un turno ----------
  let pauseLeft = 0, pauseAt = 0;
  function pauseTurn() {
    if (!state.turnOpen || state.paused) return;
    state.paused = true;
    pauseLeft = Math.max(0, deadline - performance.now());
    pauseAt = performance.now();
    stopTimer(); stopListening();
    $('pause-overlay').hidden = false;
  }
  function resumeTurn() {
    if (!state.paused) return;
    state.paused = false;
    $('pause-overlay').hidden = true;
    state.turnStart += performance.now() - pauseAt;     // el tiempo en pausa no cuenta para "más rápido"
    runTimer(pauseLeft);
    startListening();
  }
  function leavePause() { state.paused = false; $('pause-overlay').hidden = true; }

  // ---------- marcador ----------
  function renderTeamScores(ol) {
    ol.hidden = !state.teams;
    ol.innerHTML = '';
    if (!state.teams) return;
    state.teams.slice().sort((a, b) => b.score - a.score).forEach((t) => {
      const li = document.createElement('li');
      li.style.setProperty('--hue', t.hue);
      const em = document.createElement('span'); em.className = 'rank'; em.textContent = t.emoji;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = 'Equipo ' + t.name;
      const pts = document.createElement('span'); pts.className = 'pts'; pts.textContent = t.score + ' pts';
      li.append(em, nm);
      if (state.settings.mode === 'eliminar') {
        const hh = document.createElement('span'); hh.className = 'hearts'; hh.textContent = hearts(t);
        li.appendChild(hh);
      }
      li.appendChild(pts);
      ol.appendChild(li);
    });
  }
  function renderScores(ol, { skipOut = false } = {}) {
    ol.innerHTML = '';
    // Con eliminación, los que siguen en pie van arriba (el ganador por supervivencia queda primero).
    const elim = state.settings.mode === 'eliminar' && !state.teams;
    const rows = state.players.map((p, i) => ({ p, i })).sort((a, b) => (elim ? b.p.alive - a.p.alive : 0) || b.p.score - a.p.score);
    rows.forEach(({ p }, rank) => {
      const li = document.createElement('li');
      if (!p.alive) li.className = 'out';
      const rk = document.createElement('span');
      rk.className = 'rank';
      rk.textContent = rank === 0 && p.score > 0 ? '🥇' : String(rank + 1);
      const av = document.createElement('span');
      av.className = 'avatar';
      setAvatar(av, p);
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = p.name + (p.alive ? '' : ' ☠️');
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = p.score + ' pts';
      li.append(rk, av, nm, pts);
      ol.appendChild(li);
    });
  }

  // ---------- narrador y "continuar solo" ----------
  const narrate = (text) => (state.settings.voice ? speak(text) : Promise.resolve());
  let autoTimer = null;
  function cancelAutoNext() {
    clearInterval(autoTimer); autoTimer = null;
    const b = $('auto-next'); if (b) b.hidden = true;
  }
  // Cuenta regresiva visible; al llegar a 0 corre la acción pendiente. Tocarla la detiene.
  function startAutoNext(ms) {
    cancelAutoNext();
    if (!state.settings.autoNext || !state.nextAction) return;
    let left = Math.max(1, Math.round(ms / 1000));
    const b = $('auto-next');
    const paint = () => { b.textContent = `⏱ Continúa en ${left}… · toca para detener`; };
    b.hidden = false; paint();
    autoTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) { const fn = state.nextAction; cancelAutoNext(); if (fn) fn(); } else paint();
    }, 1000);
  }
  function setNext(label, fn) {
    const b = $('btn-next-round');
    b.textContent = label;
    state.nextAction = fn;
    b.onclick = () => { cancelAutoNext(); fn(); };
  }

  // ---------- fin de ronda ----------
  // ---------- frases del narrador: varían para que no suene siempre igual ----------
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const PHRASES = {
    open: {
      timeout: ['¡Se acabó el tiempo!', '¡Tiempo!', 'El reloj no perdona.', 'Se quedó en blanco.'],
      repeat: ['¡Esa ya la dijeron!', 'Palabra repetida.', '¡Repetida, no se vale!'],
      letter: ['¡Esa no empieza con la letra!', 'Letra equivocada.'],
      other: ['La ronda finalizó.', '¡Uy, esa no vale!', '¡Fallaste!', 'Mmm… esa no estaba.'],
    },
    out: [(n) => `El eliminado es ${n}.`, (n) => `${n} queda fuera.`, (n) => `Se despide ${n}.`, (n) => `Adiós, ${n}.`, (n) => `${n} sale del juego.`],
    go: [(k) => 'La ronda continúa.', (k) => '¡Seguimos!', (k) => `Quedan ${k}. ¡Atentos!`, (k) => 'Que siga la ronda.', (k) => `Quedan ${k} en pie.`],
    win: [(n) => `La partida terminó. El ganador es ${n}. ¡Aplausos!`, (n) => `La partida terminó. El ganador es ${n}. ¡Nadie pudo con su vocabulario!`,
      (n) => `La partida terminó. El ganador es ${n}. ¿Quién se atreve a la revancha?`, (n) => `La partida terminó. El ganador es ${n}.`],
  };
  // Primera eliminación de la partida: la frase clásica. Las siguientes, variadas y según cómo falló.
  function elimLine(name, code, last, left) {
    state.game = state.game || { topics: 0, words: 0, longest: '', best: null, elims: 0 };
    const first = state.game.elims++ === 0;
    if (first) return `La ronda finalizó. El eliminado es ${name}.` + (last ? '' : ' La ronda continúa.');
    const open = pick(PHRASES.open[code] || PHRASES.open.other);
    return `${open} ${pick(PHRASES.out)(name)}` + (last ? '' : ' ' + pick(PHRASES.go)(left));
  }
  function noteWord(w) {
    const g = state.game;
    if (!g) return;
    g.words += 1;
    if (w && w.length > g.longest.length) g.longest = w;
  }
  function noteTopicEnd() {
    const g = state.game, t = state.topic;
    if (!g || !t) return;
    g.topics += 1;
    if (!g.best || t.used.size > g.best.n) g.best = { name: t.category.name, n: t.used.size };
  }

  function endRound(reason, heard, info) {
    closeMic();
    const player = state.players[state.current];
    const eliminate = state.settings.mode === 'eliminar';
    const team = state.teams ? state.teams[player.team] : null;
    if (eliminate && !team) player.alive = false;
    if (eliminate && team) team.lives -= 1;      // en equipos se pierde una vida, no el jugador
    state.lastFail = { heard, code: (info && info.code) || '', idx: state.current, claimed: false };
    const wordsSaid = state.topic ? state.topic.used.size : 0;
    const brokeRecord = state.topic ? saveRecord(state.topic.category.id, wordsSaid) : false;
    noteTopicEnd();

    $('end-emoji').textContent = '😢';
    $('end-title').textContent = team
      ? `¡Falló ${team.emoji} ${team.name}!`
      : (eliminate ? '¡Eliminado!' : '¡Fallaste!');
    setAvatar($('end-avatar'), player);
    $('end-player').textContent = player.name;
    const said = $('end-heard');
    said.hidden = !heard;
    said.textContent = heard ? `Dijo: “${heard}”` : '';
    $('end-reason').textContent = reason + (team && eliminate ? ` · Vidas ${hearts(team)}` : '');
    const pun = $('end-punishment');
    pun.hidden = true;
    renderScores($('end-scores'));
    renderTeamScores($('end-teams'));
    const claim = claimInfo();
    $('btn-claim').hidden = !claim;
    if (claim) $('btn-claim').textContent = `✋ Reclamar: “${claim.display}” sí vale`;

    const last = eliminate && (team ? state.teams.some((t) => t.lives <= 0) : alive().length <= 1);
    let line;
    if (team) {
      line = `La ronda finalizó. Falló el equipo ${team.name}. ` + (!eliminate ? '' : team.lives <= 0 ? 'Se quedó sin vidas.'
        : `Pierde una vida, le ${team.lives === 1 ? 'queda' : 'quedan'} ${team.lives}.`);
    } else if (eliminate) {
      line = elimLine(player.name, state.lastFail.code, last, alive().length);
    } else {
      line = pick([`La ronda finalizó. ${player.name} falló. ¡Gira la ruleta del castigo!`,
        `${pick(PHRASES.open[state.lastFail.code] || PHRASES.open.other)} ${player.name}, ¡a la ruleta del castigo!`,
        `${player.name} falló. ¡Que la ruleta decida su castigo!`]);
    }
    if (brokeRecord) line += ` ¡Nuevo récord en ${state.topic.category.name}: ${wordsSaid} palabras!`;
    else if (wordsSaid >= 5) line += ` Dijeron ${wordsSaid} palabras.`;
    if (eliminate) setNext(last ? 'Ver ganador 🏆' : 'Siguiente tema ▶', last ? showResults : goNext);
    else setNext('🎰 Girar castigo', () => spinPunishment(player, team));

    // Pausa corta para que se vea la cara de derrota y suene el lamento; luego el narrador y, si se quiere, sigue solo.
    const token = ++state.endToken;
    setTimeout(async () => {
      if (token !== state.endToken) return;
      show('round-end'); pop($('end-emoji'));
      await narrate(line);
      if (token !== state.endToken) return;
      startAutoNext(claim || Ads().canReward() ? 7000 : 3500);
    }, 900);
  }

  // Castigo: una ruleta decide cuál toca; el narrador lo lee y se deja tiempo para cumplirlo.
  async function spinPunishment(player, team) {
    const pool = shuffle(allPunishments().slice()).slice(0, 8);
    const idx = await runWheel({
      title: `😈 Castigo para ${team ? team.emoji + ' ' : ''}${player.name}`,
      items: pool.map((x) => ({ emoji: x.emoji })),
      tap: false,
      result: (i) => `${pool[i].emoji} ${pool[i].text}`,
    });
    const pun = $('end-punishment');
    pun.textContent = `${pool[idx].emoji} ${pool[idx].text}`;
    pun.hidden = false;
    $('btn-claim').hidden = true;
    setNext('Siguiente tema ▶', goNext);
    show('round-end');
    pop(pun);
    const token = ++state.endToken;
    await narrate(`El castigo es: ${pool[idx].text}`);
    if (token === state.endToken) startAutoNext(10000);
  }

  // Pasar al siguiente tema. Es la pausa natural donde puede salir un anuncio (el micrófono ya está cerrado).
  async function goNext() {
    cancelAutoNext();
    state.endToken += 1;
    const b = $('btn-next-round');
    b.disabled = true;
    try { await Promise.race([Ads().beforeNextTopic(), wait(15000)]); } catch (_) { /* sin anuncio */ }
    b.disabled = false;
    newRound();
  }

  // ---------- reclamos: si el grupo cree que una respuesta SÍ valía, vota ----------
  function claimInfo() {
    const lf = state.lastFail;
    if (!state.settings.claims || !lf || lf.claimed || lf.code !== 'unknown' || !lf.heard || !state.topic) return null;
    const word = clean(lf.heard);
    if (!word || word.split(' ').length > 4) return null;
    const L = state.topic.letter;
    if (L && word[0] !== L.toLowerCase()) return null;      // una palabra con otra letra no puede valer
    return { word, display: word.charAt(0).toUpperCase() + word.slice(1) };
  }

  function openClaim() {
    const info = claimInfo();
    if (!info) return;
    cancelAutoNext();
    state.endToken += 1;
    try { speechSynthesis.cancel(); } catch (_) { /* sin narrador */ }
    const claimant = state.lastFail.idx;
    const voters = state.players.map((p, i) => ({ p, i })).filter((x) => x.i !== claimant);
    const votes = new Map();
    const cat = state.topic.category.name + (state.topic.letter ? ' con la ' + state.topic.letter : '');
    $('vote-title').textContent = `¿Vale “${info.display}” en ${cat}?`;
    const grid = $('vote-grid');
    grid.innerHTML = '';
    let decided = false;
    const rows = voters.map(({ p, i }) => {
      const row = document.createElement('div');
      row.className = 'voter';
      const av = document.createElement('span'); av.className = 'avatar'; setAvatar(av, p);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name + (p.alive ? '' : ' 👻 juez');
      const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'yes'; yes.textContent = '👍';
      yes.setAttribute('aria-label', p.name + ': sí vale');
      const no = document.createElement('button'); no.type = 'button'; no.className = 'no'; no.textContent = '👎';
      no.setAttribute('aria-label', p.name + ': no vale');
      const vote = (v) => {
        if (decided) return;
        votes.set(i, v);
        yes.setAttribute('aria-pressed', String(v === true)); no.setAttribute('aria-pressed', String(v === false));
        Sfx.click();
        tally();
      };
      yes.onclick = () => vote(true); no.onclick = () => vote(false);
      yes.setAttribute('aria-pressed', 'false'); no.setAttribute('aria-pressed', 'false');
      row.append(av, nm, yes, no);
      grid.appendChild(row);
      return row;
    });
    // Mayoría simple de los demás jugadores; con empate no vale.
    function tally() {
      const yes = [...votes.values()].filter((v) => v === true).length;
      const no = [...votes.values()].filter((v) => v === false).length;
      const n = voters.length;
      $('vote-tally').textContent = `👍 ${yes} · 👎 ${no} · faltan ${n - yes - no}`;
      if (yes > n / 2) finish(true, yes, no);
      else if (no >= n / 2) finish(false, yes, no);
    }
    function finish(accepted, yes, no) {
      decided = true;
      rows.forEach((r) => r.querySelectorAll('button').forEach((b) => { b.disabled = true; }));
      $('vote-tally').textContent = (accepted ? '✅ ¡Aceptada! ' : '❌ No alcanzó los votos. ') + `👍 ${yes} · 👎 ${no}`;
      setTimeout(() => resolveClaim(accepted, info, yes, no), 1200);
    }
    $('btn-vote-cancel').onclick = () => {
      if (decided) return;
      decided = true;
      show('round-end');
      startAutoNext(5000);
    };
    $('vote-tally').textContent = `👍 0 · 👎 0 · faltan ${voters.length}`;
    show('vote');
  }

  async function resolveClaim(accepted, info, yes, no) {
    const cat = state.topic.category;
    const lf = state.lastFail;
    lf.claimed = true;
    logClaim({ topic: cat.name, letter: state.topic.letter, said: info.display, accepted, yes, no });
    if (!accepted) {
      show('round-end');
      $('btn-claim').hidden = true;
      Sfx.sad();
      const token = ++state.endToken;
      await narrate('Reclamo rechazado.');
      if (token === state.endToken) startAutoNext(3500);
      return;
    }
    // Aceptada: la app aprende la palabra, se deshace el fallo y la ronda continúa.
    state.learned[cat.id] = (state.learned[cat.id] || []).concat(info.word);
    saveLearned();
    indexCache.delete(cat.id);
    state.topic.index = indexFor(cat);

    const pl = state.players[lf.idx];
    const team = state.teams ? state.teams[pl.team] : null;
    const eliminate = state.settings.mode === 'eliminar';
    if (eliminate && !team) pl.alive = true;
    if (eliminate && team) team.lives += 1;
    pl.fails = Math.max(0, pl.fails - 1);
    state.topic.used.set(canonical(info.word), info.word);
    state.topic.turns += 1;
    pl.streak += 1; pl.best = Math.max(pl.best, pl.streak); pl.correct += 1;
    const pts = scoreFor({ fracLeft: 0, streak: pl.streak, mult: state.reto && state.reto.mult });
    pl.score += pts;
    if (team) team.score += pts;
    state.current = nextAlive(lf.idx);

    Sfx.clap(); confetti(30);
    toast(`✅ “${info.display}” sí vale · +${pts}`);
    const token = ++state.endToken;
    await narrate(`Reclamo aceptado. ${info.display} sí vale. La ronda continúa.`);
    if (token !== state.endToken) return;
    afterTurn();
  }

  // Todos completaron las vueltas del tema sin fallar: se cambia de tema.
  function topicCleared() {
    closeMic();
    const laps = state.settings.laps;
    $('end-emoji').textContent = '🎉';
    $('end-title').textContent = '¡Tema superado!';
    $('end-avatar').textContent = '👏';
    $('end-avatar').style.setProperty('--hue', 140);
    $('end-player').textContent = 'Nadie falló';
    $('end-heard').hidden = true;
    saveRecord(state.topic.category.id, state.topic.used.size);
    noteTopicEnd();
    $('end-reason').textContent = `${laps} ${laps === 1 ? 'vuelta' : 'vueltas'} en ${state.topic.category.name}`;
    $('end-punishment').hidden = true;
    renderScores($('end-scores'));
    renderTeamScores($('end-teams'));
    $('btn-claim').hidden = true;
    state.lastFail = null;
    setNext('Siguiente tema ▶', goNext);
    show('round-end');
    pop($('end-emoji'));
    confetti(50);
    const token = ++state.endToken;
    narrate('¡Tema superado! Nadie falló.').then(() => { if (token === state.endToken) startAutoNext(3500); });
  }

  // ---------- resultados y premios ----------
  function computeAwards() {
    const ps = state.players;
    const top = (list, key, dir) => list.slice().sort((a, b) => dir * (a[key] - b[key]))[0];
    const out = [];
    const fast = top(ps.filter((p) => p.fastest != null), 'fastest', 1);
    if (fast) out.push({ emoji: '⚡', title: 'Más rápido', who: fast, detail: (fast.fastest / 1000).toFixed(1) + ' s' });
    const hot = top(ps.filter((p) => p.best >= 2), 'best', -1);
    if (hot) out.push({ emoji: '🔥', title: 'Mejor racha', who: hot, detail: `${hot.best} seguidas` });
    const acc = top(ps.filter((p) => p.correct > 0), 'correct', -1);
    if (acc) out.push({ emoji: '🧠', title: 'Más aciertos', who: acc, detail: String(acc.correct) });
    const bad = top(ps.filter((p) => p.fails > 0), 'fails', -1);
    if (bad) out.push({ emoji: '😅', title: 'Más fallas', who: bad, detail: String(bad.fails) });
    return out;
  }

  function showResults() {
    closeMic();
    releaseWake();
    const eliminate = state.settings.mode === 'eliminar';
    const left = alive();
    const bySurvival = eliminate && left.length === 1;
    const champ = bySurvival ? left[0].p : state.players.slice().sort((a, b) => b.score - a.score)[0];
    if (state.teams) {
      const [ta, tb] = state.teams;
      let win = null;
      if (eliminate && (ta.lives <= 0 || tb.lives <= 0)) win = ta.lives <= 0 ? tb : ta;
      else if (ta.score !== tb.score) win = ta.score > tb.score ? ta : tb;
      $('results-title').textContent = win ? '¡Ganó el equipo!' : '🤝 ¡Empate!';
      const wa = $('winner-avatar');
      wa.textContent = win ? win.emoji : '🤝';
      wa.classList.remove('team-ring');
      wa.style.setProperty('--hue', win ? win.hue : 140);
      $('winner-name').textContent = win ? 'Equipo ' + win.name : 'Empate';
    } else {
      $('results-title').textContent = bySurvival ? '¡Ganó!' : '🏁 Resultados';
      if (champ) setAvatar($('winner-avatar'), champ);
      $('winner-name').textContent = champ ? champ.name : '¡Nadie!';
    }
    renderTeamScores($('final-teams'));
    renderScores($('final-scores'));
    const box = $('awards');
    box.innerHTML = '';
    computeAwards().forEach((a) => {
      const d = document.createElement('div');
      d.className = 'award';
      const e = document.createElement('div'); e.className = 'ae'; e.textContent = a.emoji;
      const t = document.createElement('b'); t.textContent = a.title;
      const w = document.createElement('span'); w.textContent = `${a.who.avatar} ${a.who.name}`;
      const dt = document.createElement('small'); dt.textContent = a.detail;
      d.append(e, t, w, dt);
      box.appendChild(d);
    });
    show('winner');
    Sfx.clap();
    confetti(90);
    // El narrador anuncia al ganador.
    let line;
    if (state.teams) {
      const [ta, tb] = state.teams;
      const win = (eliminate && (ta.lives <= 0 || tb.lives <= 0)) ? (ta.lives <= 0 ? tb : ta)
        : ta.score !== tb.score ? (ta.score > tb.score ? ta : tb) : null;
      line = win ? `La partida terminó. Ganó el equipo ${win.name}.` : 'La partida terminó en empate.';
    } else {
      line = champ ? pick(PHRASES.win)(champ.name) : 'La partida terminó.';
    }
    const token = ++state.endToken;
    setTimeout(() => { if (token === state.endToken) narrate(line); }, 700);
  }

  // ---------- resumen para compartir: una imagen con el ganador, marcador y datos curiosos ----------
  const shareUrl = () => CFG.playUrl || CFG.webUrl || '';
  function summaryData() {
    const eliminate = state.settings.mode === 'eliminar';
    const left = alive();
    // Con eliminación, quien sigue en pie va primero aunque tenga menos puntos.
    const ranked = state.players.slice().sort((a, b) => (eliminate ? (b.alive - a.alive) : 0) || b.score - a.score);
    let title = '🏆 Ganó', who = null, avatar = '🏆', hue = 45;
    if (state.teams) {
      const [ta, tb] = state.teams;
      const win = (eliminate && (ta.lives <= 0 || tb.lives <= 0)) ? (ta.lives <= 0 ? tb : ta)
        : ta.score !== tb.score ? (ta.score > tb.score ? ta : tb) : null;
      if (win) { who = 'Equipo ' + win.name; avatar = win.emoji; hue = win.hue; } else { title = '🤝 Empate'; who = 'Empate'; avatar = '🤝'; }
    } else {
      const champ = eliminate && left.length === 1 ? left[0].p : ranked[0];
      if (champ) { who = champ.name; avatar = champ.avatar; hue = champ.hue; }
      if (!(eliminate && left.length === 1)) title = '🏁 Va ganando';
    }
    const g = state.game || { topics: 0, words: 0, longest: '', best: null };
    return { title, who: who || '¡Nadie!', avatar, hue, ranked, g, awards: computeAwards().slice(0, 3) };
  }
  function summaryText() {
    const d = summaryData();
    const bits = [`${d.title === '🤝 Empate' ? '🤝 Empate' : '🏆 ' + d.who} en Caricachupas`];
    if (d.g.words) bits.push(`${d.g.words} palabras en ${d.g.topics} ${d.g.topics === 1 ? 'tema' : 'temas'}`);
    if (d.g.best && d.g.best.n) bits.push(`récord: ${d.g.best.n} en ${d.g.best.name}`);
    const url = shareUrl();
    return bits.join(' · ') + '. ¿Quién nos gana? 🎤' + (url ? ' ' + url : '');
  }
  function drawSummary() {
    const d = summaryData();
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Color Emoji", sans-serif';
    const font = (px, w = 700) => { x.font = `${w} ${px}px ${FONT}`; };
    const fit = (text, max) => { let t = String(text); while (t.length > 1 && x.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };
    const bg = x.createRadialGradient(W / 2, 0, 80, W / 2, 200, H);
    bg.addColorStop(0, '#4a2a8a'); bg.addColorStop(0.55, '#1b1033'); bg.addColorStop(1, '#120a24');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    font(64, 800); x.fillStyle = '#ffd23f'; x.fillText('🎤 Caricachupas', W / 2, 90);
    font(54, 700); x.fillStyle = '#f6f1ff'; x.fillText(d.title, W / 2, 200);
    x.beginPath(); x.arc(W / 2, 360, 110, 0, Math.PI * 2);
    x.fillStyle = `hsl(${d.hue} 70% 45%)`; x.fill();
    x.lineWidth = 10; x.strokeStyle = '#ffd23f'; x.stroke();
    font(120, 400); x.fillText(d.avatar, W / 2, 368);
    font(80, 800); x.fillStyle = '#ffffff'; x.fillText(fit(d.who, W - 120), W / 2, 540);
    // marcador
    let y = 650;
    x.textAlign = 'left';
    d.ranked.slice(0, 6).forEach((p, i) => {
      x.fillStyle = i === 0 ? 'rgba(255,210,63,.18)' : 'rgba(255,255,255,.07)';
      x.beginPath(); x.roundRect ? x.roundRect(120, y - 34, W - 240, 68, 18) : x.rect(120, y - 34, W - 240, 68); x.fill();
      font(40, 700); x.fillStyle = i === 0 ? '#ffd23f' : '#b9a9dd'; x.fillText(`${i + 1}.`, 145, y + 2);
      font(42, 400); x.fillText(p.avatar, 205, y + 2);
      font(40, 700); x.fillStyle = '#f6f1ff'; x.fillText(fit(p.name, 520), 270, y + 2);
      x.textAlign = 'right'; x.fillStyle = '#ffd23f'; x.fillText(`${p.score} pts`, W - 145, y + 2); x.textAlign = 'left';
      y += 80;
    });
    // datos curiosos
    const facts = [];
    if (d.g.words) facts.push(`🔢 ${d.g.words} palabras en ${d.g.topics} ${d.g.topics === 1 ? 'tema' : 'temas'}`);
    if (d.g.best && d.g.best.n) facts.push(`📈 Récord: ${d.g.best.n} seguidas en ${d.g.best.name}`);
    if (d.g.longest) facts.push(`📏 La más larga: “${d.g.longest.charAt(0).toUpperCase() + d.g.longest.slice(1)}”`);
    d.awards.forEach((a) => facts.push(`${a.emoji} ${a.title}: ${a.who.name} (${a.detail})`));
    x.textAlign = 'center';
    y += 50;
    font(36, 600); x.fillStyle = '#e9e1ff';
    facts.slice(0, 5).forEach((f) => { if (y < H - 120) { x.fillText(fit(f, W - 140), W / 2, y); y += 52; } });
    font(34, 700); x.fillStyle = '#ffd23f'; x.fillText('¿Quién nos gana? Juega Caricachupas 🎤', W / 2, H - 60);
    return c;
  }
  async function shareSummary() {
    const btn = $('btn-share');
    btn.disabled = true;
    try {
      const canvas = drawSummary();
      const text = summaryText();
      const title = 'Caricachupas';
      if (NATIVE && window.CCNative.share) {
        await window.CCNative.share({ dataUrl: canvas.toDataURL('image/png'), text, title });
        return;
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const file = blob && typeof File === 'function' ? new File([blob], 'caricachupas.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title });
        return;
      }
      if (navigator.share) { await navigator.share({ text, title }); return; }
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png'); a.download = 'caricachupas.png';
      document.body.appendChild(a); a.click(); a.remove();
      toast('🖼️ Imagen descargada: compártela con tu grupo');
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast('No se pudo compartir');
    } finally { btn.disabled = false; }
  }

  function quit() {
    stopTimer(); closeMic(); releaseWake(); leavePause(); cancelAutoNext(); state.endToken = (state.endToken || 0) + 1;
    state.turnOpen = false;
    try { speechSynthesis.cancel(); } catch (_) {}
    state.players.forEach(resetStats);
    renderRejected();
    renderPlayers();
    show('setup');
  }

  // ---------- pantalla encendida ----------
  let wake = null, wakeWanted = false;
  async function keepAwake() {
    wakeWanted = true;
    try {
      if ('wakeLock' in navigator && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (_) { wake = null; }
  }
  function releaseWake() { wakeWanted = false; try { if (wake) wake.release(); } catch (_) {} wake = null; }
  // El sistema suelta el bloqueo al ocultar la app: recuperarlo al volver.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeWanted) keepAwake();
  });

  // ---------- instalación como app ----------
  let installEvent = null;
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  function renderInstall() {
    const can = !isStandalone() && !!installEvent;
    document.querySelectorAll('.js-install').forEach((b) => { b.hidden = !can; });
    const ios = !isStandalone() && isIOS && !installEvent;
    document.querySelectorAll('.js-install-ios').forEach((el) => { el.hidden = !ios; });
  }
  function initInstall() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
    window.addEventListener('appinstalled', () => { installEvent = null; renderInstall(); toast('✅ App instalada'); });
    document.querySelectorAll('.js-install').forEach((b) => {
      b.onclick = async () => {
        if (!installEvent) return;
        installEvent.prompt();
        try { await installEvent.userChoice; } catch (_) {}
        installEvent = null;
        renderInstall();
      };
    });
    renderInstall();
  }

  // ---------- prueba de micrófono ----------
  let testBusy = false;
  async function testLevel() {
    if (testBusy) return;
    testBusy = true;
    const verdict = $('mic-verdict'), bar = $('mic-level'), btn = $('btn-test-level');
    btn.disabled = true;
    verdict.textContent = '🎙️ Escuchando… di “hola” con tu voz normal';
    let stream, ctx;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let peak = 0;
      const t0 = performance.now();
      await new Promise((resolve) => {
        (function loop() {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          peak = Math.max(peak, rms);
          bar.style.width = Math.min(100, Math.round(rms * 600)) + '%';
          if (performance.now() - t0 < 3500) requestAnimationFrame(loop); else resolve();
        })();
      });
      verdict.textContent = peak < 0.015 ? '🔇 Casi no se oye. Acércate o revisa el permiso del micrófono.'
        : peak < 0.05 ? '🔉 Se oye bajo. Acércate un poco al teléfono.'
        : peak < 0.45 ? '✅ ¡Se oye bien!'
        : '🔊 Muy fuerte o muy pegado. Aléjate un poco.';
      verdict.dataset.peak = peak.toFixed(3);
    } catch (e) {
      verdict.textContent = '🔒 No pude abrir el micrófono. Revisa el permiso del navegador.';
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (ctx) try { ctx.close(); } catch (_) {}
      bar.style.width = '0';
      btn.disabled = false;
      testBusy = false;
    }
  }
  function testRecognition() {
    const out = $('mic-heard'), btn = $('btn-test-sr');
    if (!SR) { out.textContent = '😕 Este navegador no entiende voz.'; return; }
    btn.disabled = true;
    out.textContent = '🎙️ Habla ahora…';
    const rec = new SR();
    rec.lang = state.settings.lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let heard = '';
    const finish = () => {
      btn.disabled = false;
      out.textContent = heard ? `✅ Te entendí: “${heard}”` : '🤔 No entendí nada. Prueba más cerca o más fuerte.';
    };
    rec.onresult = (e) => { heard = e.results[e.results.length - 1][0].transcript; out.textContent = '🗣️ ' + heard; };
    rec.onerror = (e) => { if (e.error === 'not-allowed') out.textContent = '🔒 Micrófono bloqueado.'; };
    rec.onend = finish;
    try { rec.start(); } catch (_) { finish(); }
    setTimeout(() => { try { rec.stop(); } catch (_) {} }, 6000);
  }

  // ---------- retroalimentación ----------
  const CFG = window.CC_CONFIG || {};
  const FB_QUEUE_KEY = 'caricachupas.feedback.queue.v1';
  const fb = { rating: '', type: '', from: 'setup', lastSent: 0 };

  function readQueue() { try { return JSON.parse(localStorage.getItem(FB_QUEUE_KEY) || '[]'); } catch (_) { return []; } }
  function writeQueue(q) { try { localStorage.setItem(FB_QUEUE_KEY, JSON.stringify(q.slice(-20))); } catch (_) { /* sin almacenamiento */ } }
  function fbConfigured() { const c = CFG.feedback || {}; return !!(c.formUrl && c.fields && c.fields.message); }
  function fbMeta() {
    return `v${CFG.version || '?'} · ${state.settings.lang} · ${state.settings.difficulty} · ${state.settings.teams ? 'equipos' : 'solo'}`;
  }
  function fbBody(item) {
    const f = CFG.feedback.fields, body = new URLSearchParams();
    ['rating', 'type', 'message', 'contact', 'words', 'meta'].forEach((k) => { if (f[k]) body.set(f[k], item[k] || ''); });
    return body;
  }
  // Google Forms no devuelve CORS: con no-cors solo sabemos si hubo red o no, y eso basta.
  async function postFeedback(item) {
    await fetch(CFG.feedback.formUrl, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fbBody(item),
    });
  }
  let flushing = false;   // el evento "online" puede llegar dos veces: un solo envío de cola a la vez
  async function flushFeedbackQueue() {
    if (flushing || !fbConfigured()) return;
    flushing = true;
    try {
      const q = readQueue();
      if (!q.length) return;
      writeQueue([]);                       // se sacan de la cola antes de enviar: nunca se duplican
      const rest = [];
      for (const it of q) { try { await postFeedback(it); } catch (_) { rest.push(it); } }
      if (rest.length) writeQueue(readQueue().concat(rest));
    } finally { flushing = false; }
  }
  function feedbackText(it) {
    return ['Caricachupas · opinión', `Calificación: ${it.rating || '-'}/5`, `Tipo: ${it.type || '-'}`, it.message,
      `Contacto: ${it.contact || '-'}`, it.words ? 'Palabras no reconocidas:\n' + it.words : '', `(${it.meta})`]
      .filter(Boolean).join('\n');
  }
  // Sin formulario configurado: compartir (WhatsApp, correo...) o copiar.
  async function shareFeedback(it) {
    const text = feedbackText(it);
    if (navigator.share) {
      try { await navigator.share({ title: 'Opinión sobre Caricachupas', text }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const mail = CFG.feedback && CFG.feedback.email;
    if (mail) {
      location.href = `mailto:${mail}?subject=${encodeURIComponent('Opinión sobre Caricachupas')}&body=${encodeURIComponent(text)}`;
      return 'mailto';
    }
    try { await navigator.clipboard.writeText(text); return 'copied'; } catch (_) { return 'fail'; }
  }

  function clearSeg(id) { $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false')); }
  function openFeedback(from) {
    fb.from = from; fb.rating = ''; fb.type = '';
    clearSeg('fb-rating'); clearSeg('fb-type');
    $('fb-message').value = ''; $('fb-contact').value = '';
    $('fb-form').hidden = false; $('fb-thanks').hidden = true; $('fb-send').disabled = false;
    $('fb-back').textContent = '← Volver';
    const n = readRejected().length + readClaims().length;
    $('fb-words-row').hidden = n === 0;
    $('fb-words-count').textContent = n;
    show('feedback');
  }
  async function submitFeedback(ev) {
    ev.preventDefault();
    const message = $('fb-message').value.trim();
    if (!fb.rating && !message) { toast('Elige una carita o escribe algo 🙂'); return; }
    if (Date.now() - fb.lastSent < 8000) { toast('Un momento…'); return; }
    const words = !$('fb-words-row').hidden && $('fb-words').checked
      ? readRejected().map(fmtWord)
        .concat(readClaims().map((c) => `${c.accepted ? '✔ aceptada' : '✘ rechazada'} por el grupo ${c.yes}-${c.no}: ${fmtWord(c)}`))
        .join('\n') : '';
    const item = { rating: fb.rating, type: fb.type, message, contact: $('fb-contact').value.trim(), words, meta: fbMeta() };
    $('fb-send').disabled = true;
    let note;
    if (fbConfigured()) {
      try { await postFeedback(item); note = 'Recibimos tu mensaje.'; }
      catch (_) { const q = readQueue(); q.push(item); writeQueue(q); note = 'Sin internet: lo enviaremos cuando vuelvas a conectarte.'; }
    } else {
      const r = await shareFeedback(item);
      if (r === 'cancel') { $('fb-send').disabled = false; return; }
      note = r === 'copied' ? 'Copiamos tu mensaje: pégalo donde quieras enviarlo.'
        : r === 'fail' ? 'No pudimos enviarlo desde aquí.' : 'Gracias por compartirlo.';
    }
    fb.lastSent = Date.now();
    $('fb-form').hidden = true;
    $('fb-thanks').hidden = false;
    $('fb-thanks-note').textContent = note;
    $('fb-play').hidden = !CFG.playUrl;
    $('fb-back').textContent = '← Listo';
    Sfx.ding(); confetti(30);
  }
  function initFeedback() {
    bindSeg('fb-rating', () => fb.rating, (v) => { fb.rating = v; });
    bindSeg('fb-type', () => fb.type, (v) => { fb.type = v; });
    $('fb-form').onsubmit = submitFeedback;
    $('btn-feedback').onclick = () => openFeedback('setup');
    $('btn-feedback-end').onclick = () => openFeedback('winner');
    $('fb-back').onclick = () => show(fb.from);
    $('fb-play').onclick = () => { if (CFG.playUrl) window.open(CFG.playUrl, '_blank', 'noopener'); };
    if (CFG.privacyUrl) ['lnk-privacy', 'lnk-privacy-fb'].forEach((id) => { $(id).href = CFG.privacyUrl; });
    window.addEventListener('online', flushFeedbackQueue);
    flushFeedbackQueue();
  }

  // ---------- arranque ----------
  function init() {
    loadLearned();
    loadMine();
    initSetup();
    $('btn-ok').onclick = () => acceptAnswer('', '');
    $('btn-bad').onclick = () => failTurn('El grupo dijo que falló', '', { code: 'manual' });
    $('btn-quit-end').onclick = quit;
    $('auto-next').onclick = cancelAutoNext;
    $('btn-claim').onclick = openClaim;
    $('btn-pause').onclick = pauseTurn;
    $('btn-resume').onclick = resumeTurn;
    $('btn-pause-end').onclick = () => { stopTimer(); state.turnOpen = false; leavePause(); showResults(); };
    $('btn-pause-quit').onclick = () => { leavePause(); quit(); };
    $('btn-test-level').onclick = testLevel;
    $('btn-test-sr').onclick = testRecognition;
    $('btn-test-back').onclick = () => show('setup');
    $('btn-results').onclick = showResults;
    $('btn-reward').onclick = async () => {
      cancelAutoNext();
      const b = $('btn-reward');
      b.disabled = true;
      const ok = await Ads().showReward();
      b.disabled = false;
      if (ok) {
        state.players.forEach((p) => { p.jokers.time += 1; });
        toast('🎁 +1 comodín de tiempo para todos');
        Sfx.ding();
        b.hidden = true;
      } else {
        toast('No se completó el anuncio');
        b.hidden = !Ads().canReward();
      }
    };
    $('btn-adprivacy').onclick = () => { Ads().openPrivacyOptions(); };
    $('btn-joker-time').onclick = useTimeJoker;
    $('btn-joker-pass').onclick = usePassJoker;
    $('btn-quit-winner').onclick = quit;
    $('btn-again').onclick = startFlow;
    $('btn-share').onclick = shareSummary;
    if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    initInstall();
    initFeedback();
    initTutorial();
    initWelcome();
  }
  init();
  window.__cc = { state, RETOS, indexFor, drawSummary, summaryText };   // gancho para pruebas automáticas
})();
