(function () {
  const { LETTERS, CATEGORIES, DIFFICULTIES, PUNISHMENTS, RETOS } = CCData;
  const { evaluate, buildIndex, rankedLetters, lettersForRange, meetsReto, retoFeasible, scoreFor } = CCLogic;
  const Sfx = CCSfx;
  const Wheel = CCWheel;

  const $ = (id) => document.getElementById(id);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const STORE_KEY = 'caricachupas.v1';
  const REJECTED_KEY = 'caricachupas.rejected.v1';
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
    settings: { seconds: 5, mode: 'eliminar', lang: 'es-MX', voice: true, sound: true, difficulty: 'medio', laps: 0, auto: true, retos: true, teams: false, warmMic: false, customPunishments: [] },
    micOk: false,           // false = se juega sin voz (botones ✔ / ✘)
    round: 0,
    topic: null,            // { category, letter, index, used:Map(clave->palabra), turns }
    recentCats: [],
    reto: null,             // reto sorpresa del tema actual
    lastReto: null,
    dir: 1,                 // 1 = orden normal, -1 = al revés
    forceReto: null,        // solo para pruebas
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
  function renderRejected() {
    const list = readRejected();
    $('rejected-box').hidden = list.length === 0;
    $('rejected-count').textContent = list.length;
    const ul = $('rejected-list');
    ul.innerHTML = '';
    list.slice().reverse().forEach((r) => {
      const li = document.createElement('li');
      li.textContent = `${r.topic} (${r.letter}): “${r.said}”`;
      ul.appendChild(li);
    });
  }

  // ---------- pantallas y efectos ----------
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
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
    try {
      const st = await navigator.permissions.query({ name: 'microphone' });
      return st; // PermissionStatus
    } catch (_) { return null; }
  }
  async function requestMic() {
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

    if (!SR || !navigator.mediaDevices) {
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
    $('btn-play').onclick = startFlow;
    $('rejected-clear').onclick = () => {
      try { localStorage.removeItem(REJECTED_KEY); } catch (_) {}
      renderRejected();
    };
    $('rejected-copy').onclick = async () => {
      const text = readRejected().map((r) => `${r.topic} (${r.letter}): ${r.said}`).join('\n');
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
    if (!indexCache.has(category.id)) indexCache.set(category.id, buildIndex(category.list));
    return indexCache.get(category.id);
  }

  function pickTopic() {
    const diff = DIFFICULTIES[state.settings.difficulty] || DIFFICULTIES.medio;
    let pool = CATEGORIES.filter((c) => diff.levels.includes(c.level));
    const fresh = pool.filter((c) => !state.recentCats.includes(c.id));
    if (fresh.length) pool = fresh;
    const category = pool[Math.floor(Math.random() * pool.length)];
    state.recentCats = [category.id].concat(state.recentCats).slice(0, 4);

    const letters = lettersForRange(rankedLetters(category.list, LETTERS), diff.letters);
    const letter = letters[Math.floor(Math.random() * letters.length)];
    return { category, letter, index: indexFor(category), used: new Map(), turns: 0 };
  }

  function topicLabel(t) { return `${t.category.name} con la letra ${t.letter}`; }

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
  function turnSeconds() {
    return Math.max(2, state.settings.seconds + ((state.reto && state.reto.seconds) || 0));
  }

  function newRound(starterIdx) {
    state.round += 1;
    state.topic = pickTopic();
    state.reto = pickReto(state.topic);
    state.lastReto = state.reto ? state.reto.id : null;
    state.dir = state.reto && state.reto.dir ? state.reto.dir : 1;
    state.current = starterIdx == null ? randomStarter() : starterIdx;
    const t = state.topic;
    const diff = DIFFICULTIES[state.settings.difficulty] || DIFFICULTIES.medio;
    $('topic-round').textContent = `Tema ${state.round} · ${diff.label}`;
    $('topic-emoji').textContent = t.category.emoji;
    $('topic-name').textContent = t.category.name;
    $('topic-letter').textContent = t.letter;
    setAvatar($('topic-avatar'), state.players[state.current]);
    $('topic-player').textContent = state.players[state.current].name;
    const rt = $('topic-reto');
    rt.hidden = !state.reto;
    if (state.reto) {
      $('topic-reto-name').textContent = `${state.reto.emoji} RETO: ${state.reto.label}`;
      $('topic-reto-text').textContent = state.reto.text;
    }
    show('topic');
    pop($('topic-letter'));
    if (state.reto) { pop(rt); Sfx.ding(); }
    beginRound();
  }

  // El tema se anuncia y el reloj corre enseguida: nadie tiene tiempo extra para pensar.
  async function beginRound() {
    Sfx.unlock();
    const shown = Date.now();
    const r = state.reto;
    await speak('Caricachupas. ' + topicLabel(state.topic) + (r ? `. Reto: ${r.label}. ${r.text}.` : ''));
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
    $('turn-letter').textContent = t.letter;
    setAvatar($('turn-avatar'), player);
    $('turn-player').textContent = player.name;
    const laps = state.settings.laps;
    const lapEl = $('turn-lap');
    lapEl.hidden = !laps;
    if (laps) {
      const lap = Math.min(laps, Math.floor(t.turns / alive().length) + 1);
      lapEl.textContent = `🔁 ${lap}/${laps}`;
    }
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
      if (!state.turnOpen) return;
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
    failTurn(results[0].reason, alts[0]);
  }

  function acceptAnswer(answer, key) {
    if (!state.turnOpen) return;
    state.turnOpen = false;
    stopTimer(); stopListening();
    state.topic.used.set(key || ('manual-' + state.topic.used.size), answer || 'respuesta');
    state.topic.turns += 1;

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

  function failTurn(reason, heard) {
    if (!state.turnOpen) return;
    state.turnOpen = false;
    stopTimer(); stopListening();
    Sfx.sad(); buzz([200, 80, 200]);
    shake();
    const failer = state.players[state.current];
    failer.fails += 1;
    failer.streak = 0;
    setHeard(heard ? '😢 ' + heard : '⏰', 'no');
    endRound(reason, heard);
  }
  function timeUp() { failTurn('¡Se acabó el tiempo!', ''); }

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
    const rows = state.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score);
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

  // ---------- fin de ronda ----------
  function endRound(reason, heard) {
    closeMic();
    const player = state.players[state.current];
    const eliminate = state.settings.mode === 'eliminar';
    const team = state.teams ? state.teams[player.team] : null;
    if (eliminate && !team) player.alive = false;
    if (eliminate && team) team.lives -= 1;      // en equipos se pierde una vida, no el jugador

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

    const btn = $('btn-next-round');
    if (eliminate) {
      const last = team ? state.teams.some((t) => t.lives <= 0) : alive().length <= 1;
      btn.textContent = last ? 'Ver ganador 🏆' : 'Siguiente tema ▶';
      btn.onclick = last ? showResults : () => newRound();
    } else {
      // Castigo: una ruleta decide cuál toca.
      btn.textContent = '🎰 Girar castigo';
      btn.onclick = async () => {
        const pool = shuffle(allPunishments().slice()).slice(0, 8);
        const idx = await runWheel({
          title: `😈 Castigo para ${team ? team.emoji + ' ' : ''}${player.name}`,
          items: pool.map((x) => ({ emoji: x.emoji })),
          tap: false,
          result: (i) => `${pool[i].emoji} ${pool[i].text}`,
        });
        pun.textContent = `${pool[idx].emoji} ${pool[idx].text}`;
        pun.hidden = false;
        show('round-end');
        pop(pun);
        btn.textContent = 'Siguiente tema ▶';
        btn.onclick = () => newRound();
      };
    }
    // Pausa corta para que se vea la cara de derrota y suene el lamento.
    setTimeout(() => { show('round-end'); pop($('end-emoji')); }, 900);
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
    $('end-reason').textContent = `${laps} ${laps === 1 ? 'vuelta' : 'vueltas'} en ${state.topic.category.name}`;
    $('end-punishment').hidden = true;
    renderScores($('end-scores'));
    renderTeamScores($('end-teams'));
    $('btn-next-round').textContent = 'Siguiente tema ▶';
    $('btn-next-round').onclick = () => newRound();
    show('round-end');
    pop($('end-emoji'));
    confetti(50);
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
  }

  function quit() {
    stopTimer(); closeMic(); releaseWake();
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
    const n = readRejected().length;
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
      ? readRejected().map((r) => `${r.topic} (${r.letter}): ${r.said}`).join('\n') : '';
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
    initSetup();
    $('btn-ok').onclick = () => acceptAnswer('', '');
    $('btn-bad').onclick = () => failTurn('El grupo dijo que falló', '');
    $('btn-quit-end').onclick = quit;
    $('btn-test-level').onclick = testLevel;
    $('btn-test-sr').onclick = testRecognition;
    $('btn-test-back').onclick = () => show('setup');
    $('btn-results').onclick = showResults;
    $('btn-joker-time').onclick = useTimeJoker;
    $('btn-joker-pass').onclick = usePassJoker;
    $('btn-quit-winner').onclick = quit;
    $('btn-again').onclick = startFlow;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    initInstall();
    initFeedback();
    initWelcome();
  }
  init();
  window.__cc = { state, RETOS };   // gancho para pruebas automáticas
})();
