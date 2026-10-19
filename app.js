(function () {
  const { LETTERS, CATEGORIES, DIFFICULTIES, PUNISHMENTS } = CCData;
  const { evaluate, buildIndex, rankedLetters, lettersForRange } = CCLogic;

  const $ = (id) => document.getElementById(id);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const STORE_KEY = 'caricachupas.v1';
  const REJECTED_KEY = 'caricachupas.rejected.v1';

  // ---------- estado ----------
  const state = {
    players: [],            // { name, alive }
    settings: { seconds: 5, mode: 'eliminar', lang: 'es-MX', voice: true, difficulty: 'medio', laps: 0 },
    round: 0,
    starter: 0,             // índice del jugador que abre la ronda
    topic: null,            // { category, letter, index, used:Map(clave->palabra), turns }
    recentCats: [],         // para no repetir tema seguido
    current: 0,             // índice del jugador en turno
    turnOpen: false,
  };

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
      state.players = (raw.players || []).map((name) => ({ name, alive: true }));
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

  // ---------- pantallas ----------
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

  // ---------- audio ----------
  let audioCtx;
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { /* sin audio */ }
  }
  function beep(freq, ms) {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.15;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + ms / 1000);
    } catch (_) { /* ignorar */ }
  }
  function buzz(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

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

  // ---------- configuración ----------
  function renderPlayers() {
    const ul = $('player-list');
    ul.innerHTML = '';
    state.players.forEach((p, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = p.name;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '✕';
      btn.setAttribute('aria-label', 'Quitar ' + p.name);
      btn.onclick = () => { state.players.splice(i, 1); save(); renderPlayers(); };
      li.append(span, btn);
      ul.appendChild(li);
    });
    $('btn-play').disabled = state.players.length < 2;
  }

  function initSetup() {
    load();
    $('seconds').value = state.settings.seconds;
    $('seconds-label').textContent = state.settings.seconds;
    $('mode').value = state.settings.mode;
    $('difficulty').value = state.settings.difficulty;
    $('laps').value = String(state.settings.laps);
    $('lang').value = state.settings.lang;
    $('voice').checked = state.settings.voice;
    $('mic-warning').hidden = !!SR;
    renderPlayers();

    $('player-form').onsubmit = (e) => {
      e.preventDefault();
      const input = $('player-name');
      const name = input.value.trim();
      if (!name) return;
      state.players.push({ name, alive: true });
      input.value = '';
      save(); renderPlayers();
    };
    $('seconds').oninput = (e) => {
      state.settings.seconds = +e.target.value;
      $('seconds-label').textContent = e.target.value;
      save();
    };
    $('mode').onchange = (e) => { state.settings.mode = e.target.value; save(); };
    $('difficulty').onchange = (e) => {
      state.settings.difficulty = e.target.value;
      // Cada nivel sugiere un tiempo; se puede volver a ajustar a mano.
      state.settings.seconds = DIFFICULTIES[e.target.value].seconds;
      $('seconds').value = state.settings.seconds;
      $('seconds-label').textContent = state.settings.seconds;
      save();
    };
    $('laps').onchange = (e) => { state.settings.laps = +e.target.value; save(); };
    $('lang').onchange = (e) => { state.settings.lang = e.target.value; save(); };
    $('voice').onchange = (e) => { state.settings.voice = e.target.checked; save(); };
    $('btn-play').onclick = startGame;
    $('rejected-clear').onclick = () => {
      try { localStorage.removeItem(REJECTED_KEY); } catch (_) {}
      renderRejected();
    };
    $('rejected-copy').onclick = async () => {
      const text = readRejected().map((r) => `${r.topic} (${r.letter}): ${r.said}`).join('\n');
      try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch (_) { toast('No pude copiar'); }
    };
    $('manual-judge').hidden = !!SR;
    renderRejected();
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

  function startGame() {
    unlockAudio();
    state.players.forEach((p) => { p.alive = true; });
    state.round = 0;
    state.starter = Math.floor(Math.random() * state.players.length);
    newRound();
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
  function lapLabel() {
    const laps = state.settings.laps;
    if (!laps) return '';
    const lap = Math.floor(state.topic.turns / alive().length) + 1;
    return ` · vuelta ${Math.min(lap, laps)} de ${laps}`;
  }

  function newRound() {
    state.round += 1;
    state.topic = pickTopic();
    state.current = state.players[state.starter].alive ? state.starter : nextAlive(state.starter);
    $('topic-round').textContent = state.round + ' · ' + (DIFFICULTIES[state.settings.difficulty] || DIFFICULTIES.medio).label;
    $('topic-text').textContent = topicLabel(state.topic);
    $('topic-player').textContent = state.players[state.current].name;
    show('topic');
  }

  async function beginRound() {
    unlockAudio();
    const btn = $('btn-start-round');
    btn.disabled = true;
    await speak('Caricachupas. ' + topicLabel(state.topic));
    btn.disabled = false;
    beginTurn();
  }

  // ---------- turno ----------
  let deadline = 0, tickId = null, lastSecond = null;
  let listener = null;
  let judging = false;

  function setClock(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const clock = $('turn-clock');
    clock.textContent = sec;
    clock.classList.toggle('danger', sec <= 2);
    $('turn-bar').style.transform = `scaleX(${Math.max(0, ms) / (state.settings.seconds * 1000)})`;
    if (sec !== lastSecond) {
      lastSecond = sec;
      if (sec > 0 && sec <= 3) { beep(660, 90); buzz(30); }
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
  function pauseTimer() { stopTimer(); }

  function beginTurn() {
    const player = state.players[state.current];
    state.turnOpen = true;
    judging = false;
    lastSecond = null;
    $('turn-topic').textContent = topicLabel(state.topic) + lapLabel();
    $('turn-player').textContent = player.name;
    setHeard(SR ? '🎙️ Escuchando…' : 'Sin micrófono: usa ✔ / ✘', false);
    const used = [...state.topic.used.values()];
    $('turn-used').textContent = used.length ? 'Ya dijeron: ' + used.join(', ') : '';
    show('turn');
    runTimer(state.settings.seconds * 1000);
    startListening();
  }

  function setHeard(text, ok) {
    const el = $('turn-heard');
    el.textContent = text;
    el.classList.toggle('ok', !!ok);
  }

  function startListening() {
    if (!SR) return;
    stopListening();
    const rec = new SR();
    rec.lang = state.settings.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let active = true;

    rec.onresult = (e) => {
      if (!state.turnOpen || judging) return;
      const res = e.results[e.results.length - 1];
      const alts = Array.from(res, (a) => a.transcript);
      if (!alts[0]) return;
      setHeard('🗣️ ' + alts[0], false);
      if (res.isFinal) onFinal(alts);
      else {
        const quick = check(alts[0]);
        if (quick.status === 'valid') acceptAnswer(quick.answer);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        active = false;
        setHeard('Micrófono bloqueado', false);
        $('manual-judge').hidden = false;
        toast('Permite el micrófono en el navegador');
      }
    };
    rec.onend = () => {
      // El reconocedor se corta solo tras un silencio: reiniciarlo mientras haya turno.
      if (active && state.turnOpen && !judging) {
        try { rec.start(); } catch (_) { /* ya iniciado */ }
      }
    };
    listener = { stop() { active = false; try { rec.abort(); } catch (_) {} } };
    try { rec.start(); } catch (_) { setHeard('No pude abrir el micrófono', false); }
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
    beep(880, 120); buzz(40);
    setHeard('✔ ' + (answer || 'Correcto'), true);
    state.current = nextAlive(state.current);

    const laps = state.settings.laps;
    if (laps && state.topic.turns >= laps * alive().length) {
      return setTimeout(topicCleared, 700);
    }
    setTimeout(beginTurn, 700);
  }

  function failTurn(reason, heard) {
    if (!state.turnOpen) return;
    state.turnOpen = false;
    stopTimer(); stopListening();
    beep(180, 500); buzz([200, 80, 200]);
    endRound(reason, heard);
  }
  function timeUp() { failTurn('Se acabó el tiempo ⏰', ''); }

  // ---------- fin de ronda ----------
  function endRound(reason, heard) {
    const player = state.players[state.current];
    const eliminate = state.settings.mode === 'eliminar';
    if (eliminate) player.alive = false;

    $('end-title').textContent = '💥 ¡Se acabó!';
    $('end-player').textContent = player.name;
    const said = $('end-heard');
    said.hidden = !heard;
    said.textContent = heard ? `Entendí: “${heard}”` : '';
    $('end-reason').textContent = reason + (eliminate ? ' — eliminado' : '');
    const pun = $('end-punishment');
    if (!eliminate) {
      pun.textContent = '😈 ' + PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];
      pun.hidden = false;
    } else {
      pun.hidden = true;
    }

    if (eliminate && alive().length <= 1) {
      $('btn-next-round').textContent = 'Ver ganador';
      $('btn-next-round').onclick = showWinner;
    } else {
      $('btn-next-round').textContent = 'Siguiente tema';
      $('btn-next-round').onclick = () => { state.starter = nextAlive(state.current); newRound(); };
    }
    show('round-end');
  }

  // Todos completaron las vueltas del tema sin fallar: se cambia de tema.
  function topicCleared() {
    const laps = state.settings.laps;
    $('end-title').textContent = '🎉 ¡Tema superado!';
    $('end-player').textContent = 'Nadie falló';
    $('end-heard').hidden = true;
    $('end-reason').textContent = `${laps} ${laps === 1 ? 'vuelta completa' : 'vueltas completas'} en ${state.topic.category.name}`;
    $('end-punishment').hidden = true;
    $('btn-next-round').textContent = 'Siguiente tema';
    $('btn-next-round').onclick = () => { state.starter = state.current; newRound(); };
    show('round-end');
  }

  function showWinner() {
    const left = alive();
    $('winner-name').textContent = left.length ? left[0].p.name : '¡Nadie!';
    show('winner');
  }

  function quit() {
    stopTimer(); stopListening();
    state.turnOpen = false;
    try { speechSynthesis.cancel(); } catch (_) {}
    state.players.forEach((p) => { p.alive = true; });
    renderRejected();
    show('setup');
  }

  // ---------- eventos ----------
  function init() {
    initSetup();
    $('btn-start-round').onclick = beginRound;
    $('btn-ok').onclick = () => acceptAnswer('', '');
    $('btn-bad').onclick = () => failTurn('El grupo dijo que falló', '');
    $('btn-quit-topic').onclick = quit;
    $('btn-quit-end').onclick = quit;
    $('btn-quit-winner').onclick = quit;
    $('btn-again').onclick = startGame;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
