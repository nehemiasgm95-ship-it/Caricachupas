(function () {
  const { LETTERS, CATEGORIES, DIFFICULTIES, PUNISHMENTS } = CCData;
  const { evaluate, buildIndex, rankedLetters, lettersForRange } = CCLogic;
  const Sfx = CCSfx;
  const Wheel = CCWheel;

  const $ = (id) => document.getElementById(id);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const STORE_KEY = 'caricachupas.v1';
  const REJECTED_KEY = 'caricachupas.rejected.v1';
  const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🐵', '🦄', '🐯', '🐶', '🐱', '🐰', '🐨'];
  const RING_LEN = 2 * Math.PI * 52;
  const NEXT_TURN_MS = 1100;   // deja que termine el aplauso antes de abrir el micrófono
  const REVEAL_MS = 1500;      // sin voz: tiempo que se ve el tema antes de arrancar el reloj
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- estado ----------
  const state = {
    players: [],            // { name, alive, avatar, hue }
    settings: { seconds: 5, mode: 'eliminar', lang: 'es-MX', voice: true, sound: true, difficulty: 'medio', laps: 0, auto: true },
    micOk: false,           // false = se juega sin voz (botones ✔ / ✘)
    round: 0,
    topic: null,            // { category, letter, index, used:Map(clave->palabra), turns }
    recentCats: [],
    current: 0,
    turnOpen: false,
  };

  function decorate(name, i) {
    return { name, alive: true, avatar: AVATARS[i % AVATARS.length], hue: (i * 47 + 250) % 360 };
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
  }

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
      chip.className = 'player-chip';
      const av = document.createElement('span');
      av.className = 'avatar';
      setAvatar(av, pl);
      const name = document.createElement('span');
      name.textContent = pl.name;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '✕';
      rm.setAttribute('aria-label', 'Quitar ' + pl.name);
      rm.onclick = () => {
        state.players.splice(i, 1);
        state.players = state.players.map((p, k) => decorate(p.name, k));
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

  function applyMode() {
    const auto = state.settings.auto;
    $('manual-settings').hidden = auto;
    $('auto-note').hidden = !auto;
    $('btn-play').textContent = auto ? '🎰 ¡Girar ruleta!' : '▶ ¡Jugar!';
  }

  function initSetup() {
    load();
    setSeconds(state.settings.seconds);
    $('lang').value = state.settings.lang;
    $('voice').checked = state.settings.voice;
    $('sound').checked = state.settings.sound;
    Sfx.setEnabled(state.settings.sound);

    bindSeg('seg-auto', () => (state.settings.auto ? 'auto' : 'manual'), (v) => {
      state.settings.auto = v === 'auto';
      applyMode(); save();
    });
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
      state.players.push(decorate(name, state.players.length));
      input.value = '';
      save(); renderPlayers();
    };
    $('seconds').oninput = (e) => { setSeconds(+e.target.value); save(); };
    $('lang').onchange = (e) => { state.settings.lang = e.target.value; save(); };
    $('voice').onchange = (e) => { state.settings.voice = e.target.checked; save(); };
    $('sound').onchange = (e) => { state.settings.sound = e.target.checked; Sfx.setEnabled(e.target.checked); save(); };
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
      const i = (from + k) % n;
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
    state.players.forEach((p) => { p.alive = true; });
    shuffle(state.players);               // el orden de turnos también es aleatorio
    state.round = 0;

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

  function newRound(starterIdx) {
    state.round += 1;
    state.topic = pickTopic();
    state.current = starterIdx == null ? randomStarter() : starterIdx;
    const t = state.topic;
    const diff = DIFFICULTIES[state.settings.difficulty] || DIFFICULTIES.medio;
    $('topic-round').textContent = `Tema ${state.round} · ${diff.label}`;
    $('topic-emoji').textContent = t.category.emoji;
    $('topic-name').textContent = t.category.name;
    $('topic-letter').textContent = t.letter;
    setAvatar($('topic-avatar'), state.players[state.current]);
    $('topic-player').textContent = state.players[state.current].name;
    show('topic');
    pop($('topic-letter'));
    beginRound();
  }

  // El tema se anuncia y el reloj corre enseguida: nadie tiene tiempo extra para pensar.
  async function beginRound() {
    Sfx.unlock();
    const shown = Date.now();
    await speak('Caricachupas. ' + topicLabel(state.topic));
    // Con voz, el anuncio ya da el tiempo de verlo; sin voz se deja un momento para leerlo.
    const spoke = state.settings.voice && 'speechSynthesis' in window;
    const rest = (spoke ? 400 : REVEAL_MS) - (Date.now() - shown);
    if (rest > 0) await wait(rest);
    beginTurn();
  }

  // ---------- turno ----------
  let deadline = 0, tickId = null, lastSecond = null;
  let listener = null;

  function setClock(ms) {
    const total = state.settings.seconds * 1000;
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
    show('turn');
    pop($('turn-avatar'));
    runTimer(state.settings.seconds * 1000);
    startListening();
  }

  function startListening() {
    if (!SR || !state.micOk) return;
    stopListening();
    const rec = new SR();
    rec.lang = state.settings.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let active = true;

    rec.onresult = (e) => {
      if (!state.turnOpen) return;
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
        active = false;
        state.micOk = false;
        $('manual-judge').hidden = false;
        setHeard('🔒 Micrófono bloqueado', 'no');
        toast('Permite el micrófono para jugar con voz');
      }
    };
    rec.onend = () => {
      // El reconocedor se corta solo tras un silencio: reiniciarlo mientras haya turno.
      if (active && state.turnOpen) {
        try { rec.start(); } catch (_) { /* ya iniciado */ }
      }
    };
    listener = { stop() { active = false; try { rec.abort(); } catch (_) {} } };
    try { rec.start(); } catch (_) { setHeard('No pude abrir el micrófono', 'no'); }
  }
  function stopListening() { if (listener) { listener.stop(); listener = null; } }

  function check(text) {
    return evaluate({
      text,
      letter: state.topic.letter,
      index: state.topic.index,
      used: state.topic.used,
    });
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

    // ¡Aplausos!
    Sfx.clap(); buzz(40);
    confetti(26);
    setHeard('👏 ' + (answer || '¡Correcto!'), 'ok');
    pop($('turn-heard'));
    renderUsed();
    state.current = nextAlive(state.current);

    const laps = state.settings.laps;
    const cleared = laps && state.topic.turns >= laps * alive().length;
    setTimeout(cleared ? topicCleared : beginTurn, NEXT_TURN_MS);
  }

  function failTurn(reason, heard) {
    if (!state.turnOpen) return;
    state.turnOpen = false;
    stopTimer(); stopListening();
    Sfx.sad(); buzz([200, 80, 200]);
    shake();
    setHeard(heard ? '😢 ' + heard : '⏰', 'no');
    endRound(reason, heard);
  }
  function timeUp() { failTurn('¡Se acabó el tiempo!', ''); }

  // ---------- fin de ronda ----------
  function endRound(reason, heard) {
    const player = state.players[state.current];
    const eliminate = state.settings.mode === 'eliminar';
    if (eliminate) player.alive = false;

    $('end-emoji').textContent = '😢';
    $('end-title').textContent = eliminate ? '¡Eliminado!' : '¡Fallaste!';
    setAvatar($('end-avatar'), player);
    $('end-player').textContent = player.name;
    const said = $('end-heard');
    said.hidden = !heard;
    said.textContent = heard ? `Dijo: “${heard}”` : '';
    $('end-reason').textContent = reason;
    const pun = $('end-punishment');
    if (!eliminate) {
      pun.textContent = '😈 ' + PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];
      pun.hidden = false;
    } else {
      pun.hidden = true;
    }

    const last = eliminate && alive().length <= 1;
    $('btn-next-round').textContent = last ? 'Ver ganador 🏆' : 'Siguiente tema ▶';
    $('btn-next-round').onclick = last ? showWinner : () => newRound();
    // Pausa corta para que se vea la cara de derrota y suene el lamento.
    setTimeout(() => { show('round-end'); pop($('end-emoji')); }, 900);
  }

  // Todos completaron las vueltas del tema sin fallar: se cambia de tema.
  function topicCleared() {
    const laps = state.settings.laps;
    $('end-emoji').textContent = '🎉';
    $('end-title').textContent = '¡Tema superado!';
    $('end-avatar').textContent = '👏';
    $('end-avatar').style.setProperty('--hue', 140);
    $('end-player').textContent = 'Nadie falló';
    $('end-heard').hidden = true;
    $('end-reason').textContent = `${laps} ${laps === 1 ? 'vuelta' : 'vueltas'} en ${state.topic.category.name}`;
    $('end-punishment').hidden = true;
    $('btn-next-round').textContent = 'Siguiente tema ▶';
    $('btn-next-round').onclick = () => newRound();
    show('round-end');
    pop($('end-emoji'));
    confetti(50);
  }

  function showWinner() {
    const left = alive();
    const w = left.length ? left[0].p : null;
    if (w) setAvatar($('winner-avatar'), w);
    $('winner-name').textContent = w ? w.name : '¡Nadie!';
    show('winner');
    Sfx.clap();
    confetti(90);
  }

  function quit() {
    stopTimer(); stopListening();
    state.turnOpen = false;
    try { speechSynthesis.cancel(); } catch (_) {}
    state.players.forEach((p) => { p.alive = true; });
    renderRejected();
    renderPlayers();
    show('setup');
  }

  // ---------- arranque ----------
  function init() {
    initSetup();
    $('btn-ok').onclick = () => acceptAnswer('', '');
    $('btn-bad').onclick = () => failTurn('El grupo dijo que falló', '');
    $('btn-quit-end').onclick = quit;
    $('btn-quit-winner').onclick = quit;
    $('btn-again').onclick = startFlow;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    initWelcome();
  }
  init();
})();
