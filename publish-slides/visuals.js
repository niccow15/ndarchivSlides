(function () {
  'use strict';
  const palette = ['#00b050', '#e54848', '#002060', '#ba63c4', '#dbac22', '#418ab3', '#ee8843', '#587c67', '#cf5478', '#7164b7'];
  const colors = new Map();
  function color(i) {
    if (i === -1) return '#f0f2f5';
    if (!colors.has(i)) colors.set(i, i < palette.length ? palette[i] : `hsl(${(i * 137.508 + 20) % 360} 55% ${43 + (i % 4) * 7}%)`);
    return colors.get(i);
  }
  function number(x) { return Number(x.toPrecision(3)).toString(); }
  function surface(id) {
    const canvas = typeof id === 'string' ? document.getElementById(id) : id;
    if (!canvas._size) canvas._size = { w: Number(canvas.getAttribute('width')), h: Number(canvas.getAttribute('height')) };
    const { w, h } = canvas._size;
    // The 1280px slide is CSS-scaled to the display. Match its physical pixels,
    // including while this canvas belongs to a hidden slide. Supersample at
    // smaller sizes so text and fine graph edges survive fractional scaling.
    const stage = document.getElementById('stage');
    const slideScale = stage ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
    const ratio = Math.max(2, (devicePixelRatio || 1) * slideScale);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const pixelWidth = Math.ceil(w * ratio), pixelHeight = Math.ceil(h * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    const c = canvas.getContext('2d'); c.setTransform(pixelWidth / w, 0, 0, pixelHeight / h, 0, 0); c.clearRect(0, 0, w, h);
    return { canvas, c, w, h };
  }
  function network(id, sim, target = 0, trace = null) {
    const { canvas, c, w, h } = surface(id), n = sim.agents.length;
    const radius = Math.min(w * .36, h * .405), cx = w / 2, cy = h / 2;
    const points = Array.from({ length: n }, (_, i) => ({ x: cx + radius * Math.cos(i / n * 2 * Math.PI - Math.PI / 2), y: cy + radius * Math.sin(i / n * 2 * Math.PI - Math.PI / 2), r: Math.min(13, radius * Math.PI / n * .65) }));
    c.lineWidth = .6; c.strokeStyle = '#dfe6ec';
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { c.beginPath(); c.moveTo(points[i].x, points[i].y); c.lineTo(points[j].x, points[j].y); c.stroke(); }
    if (trace) {
      c.lineWidth = 2.7; c.strokeStyle = '#002060';
      for (const i of new Set(trace.indices)) {
        if (i === target) continue; // Self-samples get a centered marker below.
        const a = points[target], b = points[i]; c.beginPath();
        c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
    const highlighted = new Set(trace ? [target, ...trace.indices] : []);
    points.forEach((p, i) => {
      c.globalAlpha = trace && !highlighted.has(i) ? .52 : 1;
      c.fillStyle = color(sim.agents[i]); c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = sim.agents[i] === -1 ? '#96a3b3' : '#00000035'; c.lineWidth = 1.5; c.stroke();
      if (sim.agents[i] === -1) { c.fillStyle = '#657080'; c.font = '16px Cambria'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⊥', p.x, p.y); }
      c.globalAlpha = 1;
      if (i === target) { c.strokeStyle = '#002060'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2); c.stroke(); }
      if (i === target && trace?.indices.includes(target)) {
        c.strokeStyle = '#002060'; c.lineWidth = 1.8; c.setLineDash([3, 3]);
        c.beginPath(); c.arc(p.x, p.y, p.r + 10, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }
    });
    c.fillStyle = '#ffffffee'; c.fillRect(cx - 71, cy - 21, 142, 42);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#002060'; c.font = '16px Arial'; c.fillText(`Agent ${target + 1} selected`, cx, cy - 6);
    c.fillStyle = '#647181'; c.font = '13px Arial'; c.fillText(`${n} agents · complete graph`, cx, cy + 14);
    canvas._points = points;
    canvas.setAttribute('aria-label', `${sim.protocol}, round ${sim.round}; agent ${target + 1} selected; ${sim.statistics.k} states present.`);
  }
  function grid(id, sim) {
    const { c, w, h } = surface(id), n = sim.agents.length;
    const cols = Math.ceil(Math.sqrt(n * (w - 20) / (h - 20))), rows = Math.ceil(n / cols), dx = (w - 20) / cols, dy = (h - 20) / rows;
    const r = Math.min(9, dx * .3, dy * .3);
    sim.agents.forEach((opinion, i) => { c.fillStyle = color(opinion); c.beginPath(); c.arc(10 + (i % cols + .5) * dx, 10 + (Math.floor(i / cols) + .5) * dy, r, 0, Math.PI * 2); c.fill(); });
  }
  function histogram(id, sim, options = {}) {
    const { c, w, h, canvas } = surface(id), s = sim.statistics, left = 62, right = w - 10, top = 25, bottom = h - 31;
    const max = options.max || Math.min(1, s.m * 1.3), y = p => bottom - p / max * (bottom - top);
    c.font = '14px Arial'; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let j = 0; j <= 3; j++) { const v = max * j / 3; c.strokeStyle = '#e3e8ed'; c.lineWidth = 1; c.beginPath(); c.moveTo(left, y(v)); c.lineTo(right, y(v)); c.stroke(); c.fillStyle = '#788594'; c.fillText(number(v), left - 8, y(v)); }
    const step = (right - left) / s.k;
    s.ranked.forEach(([opinion, count], j) => {
      const gap = Math.min(5, step * .15), x = left + j * step + gap / 2, bw = Math.max(.3, step - gap);
      c.fillStyle = color(opinion); c.globalAlpha = options.focus === 'm' && count < s.largestCount ? .45 : 1;
      c.fillRect(x, y(count / s.n), bw, bottom - y(count / s.n)); c.globalAlpha = 1;
      if (options.pair?.includes(opinion)) { c.strokeStyle = '#17212f'; c.lineWidth = 2; c.strokeRect(x, y(count / s.n), Math.max(2, bw), bottom - y(count / s.n)); }
    });
    if (options.initialMax !== undefined || options.focus === 'm') {
      const reference = options.initialMax ?? s.m, py = y(reference);
      c.strokeStyle = '#008540'; c.lineWidth = 1.3; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(left, py); c.lineTo(right, py); c.stroke(); c.setLineDash([]);
      const label = `m₀ = ${number(reference)}`; c.font = '16px Cambria'; const lw = c.measureText(label).width;
      c.fillStyle = '#ffffffed'; c.fillRect(right - lw - 10, py - 23, lw + 10, 21); c.fillStyle = '#008540'; c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText(label, right - 3, py - 23);
    }
    c.fillStyle = '#788594'; c.font = '13px Arial'; c.textBaseline = 'top'; c.textAlign = 'left'; c.fillText('opinion rank', left, bottom + 10); c.textAlign = 'right'; c.fillText(`${s.k} opinions`, right, bottom + 10);
    canvas.setAttribute('aria-label', `${s.k} opinions, maximum density ${number(s.m)}, collision probability ${number(s.gamma)}.`);
  }
  function history(id, sim) {
    const { canvas, c, w, h } = surface(id), left = 43, right = w - 13, top = 14, bottom = h - 36;
    const maxT = Math.max(10, sim.round), x = t => left + t / maxT * (right - left), y = v => bottom - v * (bottom - top);
    const firstBalanced = sim.history.find(p => p.m <= 2 * p.gamma);
    c.font = '14px Arial'; c.fillStyle = '#788594'; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let j = 0; j <= 4; j++) { c.strokeStyle = '#e3e8ed'; c.lineWidth = 1; c.beginPath(); c.moveTo(left, y(j / 4)); c.lineTo(right, y(j / 4)); c.stroke(); c.fillText(number(j / 4), left - 8, y(j / 4)); }
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let j = 0; j <= 4; j++) { const t = Math.round(maxT * j / 4); c.fillText(t, x(t), bottom + 9); }
    c.textAlign = 'right'; c.fillText('round', right, h - 14);
    if (firstBalanced) {
      c.save(); c.strokeStyle = '#647181'; c.lineWidth = 2; c.lineCap = 'round'; c.setLineDash([1, 5]);
      c.beginPath(); c.moveTo(x(firstBalanced.round), top); c.lineTo(x(firstBalanced.round), bottom); c.stroke(); c.restore();
    }
    for (const [key, stroke] of [['gamma', '#8c54b9'], ['m', '#00a650']]) {
      c.strokeStyle = stroke; c.lineWidth = 2.8; c.beginPath();
      const stride = Math.max(1, Math.floor(sim.history.length / (right - left)));
      for (let i = 0; i < sim.history.length; i += stride) { const p = sim.history[i]; if (i === 0) c.moveTo(x(p.round), y(p[key])); else c.lineTo(x(p.round), y(p[key])); }
      const p = sim.history[sim.history.length - 1]; c.lineTo(x(p.round), y(p[key])); c.stroke(); c.fillStyle = stroke; c.beginPath(); c.arc(x(p.round), y(p[key]), 4, 0, Math.PI * 2); c.fill();
    }
    if (firstBalanced) {
      const label = `Balanced · round ${firstBalanced.round}`;
      c.save(); c.font = '14px Arial'; c.textAlign = 'left'; c.textBaseline = 'top';
      const labelWidth = c.measureText(label).width, labelX = Math.max(left + 5, Math.min(x(firstBalanced.round) + 8, right - labelWidth - 5));
      c.fillStyle = '#ffffffed'; c.fillRect(labelX - 4, top + 2, labelWidth + 8, 21);
      c.fillStyle = '#647181'; c.fillText(label, labelX, top + 5); c.restore();
    }
    canvas.setAttribute('aria-label', `Maximum density and collision probability through round ${sim.round}. ${firstBalanced ? `First balanced configuration at round ${firstBalanced.round}, marked by a dotted vertical line.` : 'The configuration has not yet become balanced.'}`);
  }
  function title() {
    const { c, w, h } = surface('title-bars'), baseline = h - 5, scale = 21;
    [[4, 4, 4, 4], [4, ...Array(12).fill(1)]].forEach((counts, k) => {
      const offset = k * 183 + 6, width = 145, slot = width / counts.length;
      counts.forEach((count, i) => { c.fillStyle = color(i); c.fillRect(offset + i * slot, baseline - count * scale, slot - Math.min(4, slot / 5), count * scale); });
    });
    c.strokeStyle = '#008540'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, baseline - 4 * scale); c.lineTo(w, baseline - 4 * scale); c.stroke(); c.setLineDash([]);
    c.font = '19px Cambria'; c.fillStyle = '#008540'; c.fillText('m₀', 160, baseline - 4 * scale - 9);
  }
  window.DeckVisuals = { color, number, network, grid, histogram, history, title };
})();
