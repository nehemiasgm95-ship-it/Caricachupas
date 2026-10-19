// Ruleta SVG: se dibuja con N sectores, gira con desaceleración y cae en el sector elegido.
(function (root) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#ff6b6b', '#ffd23f', '#4dabf7', '#51cf66', '#f783ac', '#b197fc', '#ffa94d', '#3bc9db',
    '#e599f7', '#94d82d', '#74c0fc', '#ff8787'];
  let speed = 1; // para pruebas: 0.05 = 20 veces más rápida

  function polar(r, deg) {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  // Ángulo total que debe girar la rueda (en sentido horario) para que el sector `idx`
  // quede bajo la flecha de arriba. `jitter` en [-0.4, 0.4] mueve el punto dentro del sector.
  function landing(idx, n, jitter, turns) {
    const seg = 360 / n;
    const center = idx * seg + seg / 2 + (jitter || 0) * seg;
    return (turns == null ? 5 : turns) * 360 + ((((360 - center) % 360) + 360) % 360);
  }
  // Sector que queda bajo la flecha cuando la rueda ha girado `theta` grados.
  function indexAt(theta, n) {
    const a = (((-theta % 360) + 360) % 360);
    return Math.floor(a / (360 / n)) % n;
  }

  function el(name, attrs) {
    const e = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  }

  // items: [{ emoji, label }]
  function build(svg, items) {
    svg.innerHTML = '';
    const n = items.length;
    const seg = 360 / n;
    const g = el('g', { id: 'wheel-rotor' });
    items.forEach((it, i) => {
      const a0 = i * seg, a1 = (i + 1) * seg, mid = a0 + seg / 2;
      const [x0, y0] = polar(96, a0), [x1, y1] = polar(96, a1);
      g.appendChild(el('path', {
        d: `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 ${seg > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`,
        fill: COLORS[i % COLORS.length], stroke: '#1b1033', 'stroke-width': 1.5,
      }));
      const withText = n <= 6 && it.label;
      const [ex, ey] = polar(withText ? 70 : 66, mid);
      const emoji = el('text', {
        x: ex.toFixed(2), y: ey.toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': n <= 6 ? 24 : n <= 8 ? 20 : 16, transform: `rotate(${mid} ${ex.toFixed(2)} ${ey.toFixed(2)})`,
      });
      emoji.textContent = it.emoji;
      g.appendChild(emoji);
      if (withText) {
        const [tx, ty] = polar(40, mid);
        const t = el('text', {
          x: tx.toFixed(2), y: ty.toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': 11, 'font-weight': 800, fill: '#1b1033',
          transform: `rotate(${mid} ${tx.toFixed(2)} ${ty.toFixed(2)})`,
        });
        t.textContent = it.label;
        g.appendChild(t);
      }
    });
    svg.appendChild(g);
    svg.appendChild(el('circle', { cx: 0, cy: 0, r: 97, fill: 'none', stroke: '#fff', 'stroke-width': 3, opacity: 0.9 }));
    svg.appendChild(el('circle', { cx: 0, cy: 0, r: 12, fill: '#1b1033', stroke: '#fff', 'stroke-width': 3 }));
    return g;
  }

  /**
   * Gira la rueda y devuelve el índice ganador (elegido al azar antes de girar).
   * onTick se llama cada vez que la flecha cruza al siguiente sector.
   */
  function spin(svg, n, { ms = 4200, turns = 5, pick, onTick } = {}) {
    const rotor = svg.querySelector('#wheel-rotor');
    const idx = pick == null ? Math.floor(Math.random() * n) : pick;
    const jitter = Math.random() * 0.7 - 0.35;
    const total = landing(idx, n, jitter, turns);
    const dur = Math.max(30, ms * speed);
    return new Promise((resolve) => {
      let last = indexAt(0, n);
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - t, 3.4);
        const theta = total * eased;
        rotor.setAttribute('transform', `rotate(${theta.toFixed(2)})`);
        const cur = indexAt(theta, n);
        if (cur !== last) { last = cur; if (onTick) onTick(); }
        if (t < 1) requestAnimationFrame(frame);
        else resolve(idx);
      }
      requestAnimationFrame(frame);
    });
  }

  const api = { build, spin, landing, indexAt, setSpeed(v) { speed = v; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCWheel = api;
})(typeof self !== 'undefined' ? self : this);
