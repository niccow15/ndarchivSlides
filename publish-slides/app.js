(function () {
  'use strict';
  const { Simulation } = window.Consensus;
  const $ = id => document.getElementById(id);
  const allowedN = [64, 100, 400, 1600];
  const allowedViews = ['compare', 'round', 'proof'];
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const initialView = location.hash.slice(1).split('?')[0];
  let view = allowedViews.includes(initialView) ? initialView : 'compare';
  let protocol = query.get('protocol') === '2choices' ? '2choices' : '3majority';
  let n = allowedN.includes(Number(query.get('n'))) ? Number(query.get('n')) : 100;
  let seed = query.has('seed') && /^\d+$/.test(query.get('seed')) ? Number(query.get('seed')) >>> 0 : 2026;
  let playing = false, previousTime = 0, accumulator = 0, scale = 0, pending = null, lastTrace = null, traceRound = 0;
  let balanced, unbalanced, tutorial;
  let target = 0;
  const hover = new Map();
  const hitMaps = new Map();
  const canvases = [...document.querySelectorAll('canvas')];
  const colors = new Map();
  const baseColors = ['#00b050', '#e54848', '#002060', '#ba63c4', '#dcad24', '#418ab3', '#f18b42', '#587c67', '#cf5478', '#7164b7'];

  function color(opinion) {
    if (!colors.has(opinion)) colors.set(opinion, opinion < baseColors.length ? baseColors[opinion] : `hsl(${(opinion * 137.508 + 20) % 360} 55% ${43 + (opinion % 4) * 7}%)`);
    return colors.get(opinion);
  }
  function number(x) { return x >= 0.1 ? Number(x.toFixed(3)).toString() : Number(x.toPrecision(3)).toString(); }
  function percent(x) { return `${Number((x * 100).toFixed(2))}%`; }
  function announce(message) { $('announcement').textContent = message; }
  function showRound(id, sim) {
    $(id).textContent = sim.statistics.consensus ? `Consensus · ${sim.round} rounds` : `Round ${sim.round}`;
    $(id).classList.toggle('finished', sim.statistics.consensus);
  }
  function initialStats(sim) {
    const s = sim.initial;
    return `<div class="initial-stat"><span class="symbol">k<sub>0</sub></span><strong>${s.k.toLocaleString()}</strong></div><div class="initial-stat"><span class="symbol">γ<sub>0</sub></span><strong>${number(s.gamma)}</strong></div><div class="initial-stat same"><span class="symbol">m<sub>0</sub></span><strong>${number(s.m)}</strong></div>`;
  }
  function liveStats(sim) {
    const s = sim.statistics;
    return `<span><b>${s.k.toLocaleString()}</b> opinions alive</span><span><span class="symbol">m<sub>t</sub></span> <b>${number(s.m)}</b></span><span><span class="symbol">γ<sub>t</sub></span> <b>${number(s.gamma)}</b></span>`;
  }
  function saveLocation() {
    const hash = `#${view}?protocol=${protocol}&n=${n}&seed=${seed}`;
    // file:// works offline; history permissions vary between browsers.
    try { history.replaceState(null, '', hash); } catch { /* URL state is optional. */ }
  }
  function reset() {
    pause();
    balanced = new Simulation(n, 'balanced', protocol, (seed ^ 0x9e3779b9) >>> 0);
    unbalanced = new Simulation(n, 'unbalanced', protocol, (seed ^ 0x243f6a88) >>> 0);
    resetTutorial();
    scale = Math.min(1, balanced.initial.m * 1.35);
    hover.clear();
    $('tooltip').hidden = true;
    const root = Math.sqrt(n);
    $('balanced-description').textContent = `${root} opinions, each with ${root} supporters.`;
    $('unbalanced-description').textContent = `One opinion with ${root} supporters; ${n - root} singleton opinions.`;
    $('balanced-initial').innerHTML = initialStats(balanced);
    $('unbalanced-initial').innerHTML = initialStats(unbalanced);
    $('population').value = n;
    $('seed').value = seed;
    $('target').max = n;
    saveLocation();
    render();
    announce(`Reset to seed ${seed}. ${n} agents in each population.`);
  }
  function resetTutorial() {
    tutorial = new Simulation(n, $('tutorial-config').value, protocol, (seed ^ 0xb7e15162) >>> 0);
    target = Math.min(target, n - 1);
    $('target').value = target + 1;
    pending = null; lastTrace = null;
  }
  function pause() {
    playing = false;
    accumulator = 0;
    updateControls();
  }
  function complete() { return view === 'proof' ? unbalanced.statistics.consensus : balanced.statistics.consensus && unbalanced.statistics.consensus; }
  function advance() {
    if (complete()) return;
    balanced.step();
    unbalanced.step();
    scale = Math.max(scale, Math.min(1, Math.max(balanced.statistics.m, unbalanced.statistics.m) * 1.12));
    if (complete()) {
      pause();
      announce(view === 'proof' ? `The unbalanced population reached consensus in ${unbalanced.round} rounds.` : `Both populations reached consensus. Balanced: ${balanced.round} rounds. Unbalanced: ${unbalanced.round} rounds.`);
    }
  }
  function togglePlay() {
    if (view === 'round') { if (pending) applyTutorial(); else drawSamples(); return; }
    if (playing) pause();
    else if (!complete()) { playing = true; previousTime = performance.now(); accumulator = 0; updateControls(); }
  }
  function frame(time) {
    if (playing) {
      accumulator += Math.min(time - previousTime, 250);
      previousTime = time;
      const interval = 1000 / Number($('speed').value);
      let changed = false;
      while (accumulator >= interval && playing) { accumulator -= interval; advance(); changed = true; }
      if (changed) render();
    }
    requestAnimationFrame(frame);
  }
  function setView(next) {
    if (!allowedViews.includes(next)) return;
    pause(); view = next;
    const content = {
      compare: ['THE INITIAL DISTRIBUTION', 'Same maximum. <span>Different distributions.</span>', 'Change everything around the largest opinion. What happens to consensus?'],
      round: ['THE MICROSCOPIC RULE', 'A few samples. <span>A collective decision.</span>', 'Inspect one agent’s samples, then apply a complete synchronous round.'],
      proof: ['THE UPPER-BOUND INTUITION', 'Follow the maximum. <span>Watch the drift.</span>', 'The same unbalanced trajectory, viewed through its two key statistics.']
    }[view];
    $('eyebrow').textContent = content[0]; $('view-title').innerHTML = content[1]; $('view-subtitle').textContent = content[2];
    for (const v of allowedViews) { $(`${v}-view`).hidden = v !== view; $(`${v}-view`).classList.toggle('active', v === view); }
    document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('speed-group').hidden = view === 'round';
    $('tooltip').hidden = true;
    saveLocation(); render();
  }
  function updateControls() {
    if (!$('play') || !balanced) return;
    const inspect = view === 'round';
    $('play').innerHTML = inspect ? '<span aria-hidden="true">↗</span> Draw samples' : playing ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Run';
    $('play').disabled = inspect ? !!pending || tutorial.statistics.consensus : complete();
    $('play').title = inspect ? 'Draw the next synchronous round’s samples (Space)' : 'Run or pause (Space)';
    $('play').setAttribute('aria-pressed', String(playing));
    $('step').innerHTML = inspect ? 'Apply round <span aria-hidden="true">→</span>' : 'Step <span aria-hidden="true">→</span>';
    $('step').disabled = inspect ? !pending : complete();
    $('step').title = inspect ? 'Apply all prepared updates simultaneously (Space or Right arrow)' : 'Advance one round (Right arrow)';
    $('target').disabled = !!pending;
    document.querySelectorAll('[data-protocol]').forEach(b => { const on = b.dataset.protocol === protocol; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  }

  function prepareCanvas(id) {
    const canvas = $(id), rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, width: rect.width, height: rect.height, canvas };
  }
  function agentLayout(width, height, size) {
    const padding = 12, w = width - padding * 2, h = height - padding * 2;
    const columns = Math.ceil(Math.sqrt(size * w / h));
    const rows = Math.ceil(size / columns), dx = w / columns, dy = h / rows;
    const radius = Math.min(dx * .29, dy * .29, view === 'round' ? 13 : 10);
    return Array.from({ length: size }, (_, i) => ({ x: padding + (i % columns + .5) * dx, y: padding + (Math.floor(i / columns) + .5) * dy, r: radius }));
  }
  function drawAgents(id, sim, trace = null, highlightLeader = false) {
    const surface = prepareCanvas(id); if (!surface) return;
    const { ctx, width, height } = surface;
    const points = agentLayout(width, height, n);
    const hovered = hover.get(id);
    const sampled = new Set(trace ? trace.indices : []);
    if (trace) {
      const start = points[trace.target];
      ctx.strokeStyle = '#00206060'; ctx.lineWidth = 1.3; ctx.setLineDash([3, 4]);
      for (const j of sampled) {
        const end = points[j]; ctx.beginPath();
        if (j === trace.target) ctx.arc(start.x + start.r, start.y - start.r, start.r * 1.6, .1, Math.PI * 1.8);
        else { ctx.moveTo(start.x, start.y); ctx.quadraticCurveTo((start.x + end.x) / 2, Math.min(start.y, end.y) - 18, end.x, end.y); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    points.forEach((p, j) => {
      const opinion = sim.agents[j];
      ctx.globalAlpha = hovered !== undefined && hovered !== opinion ? .32 : 1;
      ctx.fillStyle = color(opinion); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if ((hovered !== undefined && hovered === opinion) || (highlightLeader && opinion === sim.statistics.leader)) {
        ctx.strokeStyle = '#17212f'; ctx.lineWidth = .8; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (id === 'tutorial-agents' && (j === target || sampled.has(j))) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (j === target ? 4 : 2.5), 0, Math.PI * 2);
        ctx.strokeStyle = j === target ? '#002060' : '#8090a5'; ctx.lineWidth = j === target ? 2.2 : 1.5; ctx.stroke();
      }
    });
    hitMaps.set(id, { kind: 'agents', points, sim });
    $(id).setAttribute('aria-label', `${n} agents, ${sim.statistics.k} opinions, round ${sim.round}. Largest opinion: ${sim.statistics.largestCount} supporters.`);
  }
  function drawHistogram(id, sim, yMax) {
    const surface = prepareCanvas(id); if (!surface) return;
    const { ctx, width, height } = surface;
    const left = 35, right = 8, top = 12, bottom = height - 20, w = width - left - right, h = bottom - top;
    const s = sim.statistics, hovered = hover.get(id);
    const y = value => bottom - value / yMax * h;
    ctx.font = '9px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let j = 0; j <= 3; j++) {
      const value = yMax * j / 3, py = y(value);
      ctx.strokeStyle = '#e7ebee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(width - right, py); ctx.stroke();
      ctx.fillStyle = '#7c8691'; ctx.fillText(number(value), left - 7, py);
    }
    const slot = w / s.k;
    s.ranked.forEach(([opinion, count], j) => {
      const gap = Math.min(slot * .18, 5);
      ctx.fillStyle = color(opinion); ctx.globalAlpha = hovered !== undefined && hovered !== opinion ? .3 : 1;
      ctx.fillRect(left + j * slot + gap / 2, y(count / n), Math.max(.2, slot - gap), bottom - y(count / n));
    });
    ctx.globalAlpha = 1; ctx.setLineDash([4, 4]); ctx.strokeStyle = '#17212f77'; ctx.beginPath(); ctx.moveTo(left, y(sim.initial.m)); ctx.lineTo(width - right, y(sim.initial.m)); ctx.stroke(); ctx.setLineDash([]);
    const label = `m₀ = ${number(sim.initial.m)}`;
    ctx.font = '10px Arial'; const lw = ctx.measureText(label).width;
    const ly = Math.max(1, y(sim.initial.m) - 13);
    ctx.fillStyle = '#ffffffec'; ctx.fillRect(width - right - lw - 7, ly - 1, lw + 7, 13);
    ctx.fillStyle = '#596575'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(label, width - right - 2, ly);
    ctx.font = '9px Arial'; ctx.textAlign = 'left'; ctx.fillStyle = '#7c8691'; ctx.fillText('opinion rank', left, bottom + 7);
    ctx.textAlign = 'right'; ctx.fillText(`${s.k} alive`, width - right, bottom + 7);
    hitMaps.set(id, { kind: 'histogram', sim, left, slot, bottom, top, width: w });
    $(id).setAttribute('aria-label', `Histogram at round ${sim.round}: ${s.k} opinions, maximum density ${number(s.m)}, collision probability ${number(s.gamma)}. Initial maximum ${number(sim.initial.m)}.`);
  }
  function drawHistory() {
    const surface = prepareCanvas('history'); if (!surface) return;
    const { ctx, width, height } = surface;
    const left = 35, right = width - 14, top = 12, bottom = height - 27;
    const maxT = Math.max(10, unbalanced.round), history = unbalanced.history;
    const x = t => left + t / maxT * (right - left), y = v => bottom - v * (bottom - top);
    ctx.font = '10px Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let j = 0; j <= 4; j++) {
      ctx.strokeStyle = '#e7ebee'; ctx.beginPath(); ctx.moveTo(left, y(j / 4)); ctx.lineTo(right, y(j / 4)); ctx.stroke();
      ctx.fillStyle = '#7c8691'; ctx.fillText(number(j / 4), left - 8, y(j / 4));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let j = 0; j <= 4; j++) { const t = Math.round(maxT * j / 4); ctx.fillText(t, x(t), bottom + 7); }
    ctx.textAlign = 'right'; ctx.fillText('round', right, height - 10);
    for (const [key, stroke] of [['gamma', '#8c54b9'], ['m', '#00a650']]) {
      ctx.strokeStyle = stroke; ctx.lineWidth = 2.2; ctx.beginPath();
      // At most one representative point per horizontal pixel, retaining endpoints.
      const stride = Math.max(1, Math.floor(history.length / (right - left)));
      for (let i = 0; i < history.length; i += stride) { const p = history[i]; if (i === 0) ctx.moveTo(x(p.round), y(p[key])); else ctx.lineTo(x(p.round), y(p[key])); }
      const last = history[history.length - 1]; ctx.lineTo(x(last.round), y(last[key])); ctx.stroke();
      ctx.fillStyle = stroke; ctx.beginPath(); ctx.arc(x(last.round), y(last[key]), 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawSamples() {
    if (pending || tutorial.statistics.consensus) return;
    pending = tutorial.prepare(target); lastTrace = pending.trace; traceRound = tutorial.round;
    render(); announce(`Samples drawn for agent ${target + 1}. Apply round to commit all updates.`);
  }
  function applyTutorial() {
    if (!pending) return;
    tutorial.commit(pending); pending = null;
    render(); announce(`All agents updated simultaneously. Round ${tutorial.round}. ${tutorial.statistics.k} opinions remain.`);
  }
  function chip(opinion) { return `<span class="opinion-chip"><i style="background:${color(opinion)}"></i>Opinion ${opinion + 1}</span>`; }
  function renderTutorial() {
    showRound('tutorial-round', tutorial);
    drawAgents('tutorial-agents', tutorial, pending ? lastTrace : null);
    const count = protocol === '3majority' ? 3 : 2;
    $('tutorial-rule-title').textContent = count === 3 ? 'Three samples. One opinion.' : 'Two samples. Change only on agreement.';
    $('tutorial-rule').textContent = count === 3 ? 'Adopt the majority opinion in the sample. If all three differ, choose one of them uniformly at random.' : 'If both samples have the same opinion, adopt it. If they disagree, keep the current opinion.';
    $('sample-label').textContent = lastTrace ? `SAMPLES FROM ROUND ${traceRound} · AGENT ${lastTrace.target + 1}` : 'SAMPLES FROM THE CURRENT ROUND';
    if (!lastTrace) {
      $('samples').innerHTML = Array.from({ length: count }, (_, j) => `<div class="sample"><div class="sample-circle sample-empty">?</div><span>Sample ${j + 1}</span></div>`).join('');
      $('tutorial-outcome').textContent = 'Draw samples to inspect the next update.';
      $('agent-change').innerHTML = `${chip(tutorial.agents[target])}<span>current opinion</span>`;
    } else {
      const t = lastTrace;
      $('samples').innerHTML = t.samples.map((opinion, j) => `<div class="sample"><div class="sample-circle" style="background:${color(opinion)}">${opinion + 1}</div><span>Agent ${t.indices[j] + 1}</span></div>`).join('');
      let explanation;
      if (protocol === '2choices') explanation = t.agree ? 'The samples agree. Adopt their opinion.' : 'The samples disagree. Keep the current opinion.';
      else explanation = t.tie ? 'Three different opinions: break the tie uniformly at random.' : 'A sampled opinion appears at least twice. Adopt that majority.';
      $('tutorial-outcome').textContent = explanation + (pending ? '' : ' Round applied.');
      $('agent-change').innerHTML = `${chip(t.before)}<span aria-label="becomes">→</span>${chip(t.after)}`;
    }
  }
  function render() {
    if (!balanced) return;
    if (view === 'compare') {
      for (const [name, sim] of [['balanced', balanced], ['unbalanced', unbalanced]]) {
        showRound(`${name}-round`, sim); $(`${name}-live`).innerHTML = liveStats(sim);
        drawAgents(`${name}-agents`, sim); drawHistogram(`${name}-histogram`, sim, scale);
      }
      $('run-status').textContent = complete() ? `A: ${balanced.round} rounds · B: ${unbalanced.round} rounds` : playing ? `Running · round ${Math.max(balanced.round, unbalanced.round)}` : balanced.round || unbalanced.round ? 'Paused · inspect the distributions' : 'Ready to compare';
    } else if (view === 'round') renderTutorial();
    else {
      showRound('proof-round', unbalanced); $('proof-live').innerHTML = liveStats(unbalanced);
      drawAgents('proof-agents', unbalanced, null, true); drawHistogram('proof-histogram', unbalanced, scale); drawHistory();
      const s = unbalanced.statistics, strong = s.m >= 2 * s.gamma;
      $('regime').textContent = s.consensus ? 'Consensus' : strong ? 'Growth condition: m ≥ 2γ' : 'Comparable densities: m < 2γ';
      $('regime').classList.toggle('balanced', !strong);
      $('ratio').innerHTML = `m<sub>t</sub> / γ<sub>t</sub> = ${number(s.m / s.gamma)}`;
    }
    updateControls();
  }

  function pointerInfo(canvas, event) {
    const hit = hitMaps.get(canvas.id); if (!hit) return null;
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (hit.kind === 'agents') {
      let index = -1, distance = Infinity;
      hit.points.forEach((p, j) => { const d = Math.hypot(x - p.x, y - p.y); if (d < Math.max(p.r + 5, 7) && d < distance) { index = j; distance = d; } });
      return index < 0 ? null : { sim: hit.sim, index, opinion: hit.sim.agents[index] };
    }
    if (x < hit.left || x >= hit.left + hit.width || y < hit.top || y > hit.bottom) return null;
    const item = hit.sim.statistics.ranked[Math.floor((x - hit.left) / hit.slot)];
    return item ? { sim: hit.sim, opinion: item[0] } : null;
  }
  canvases.forEach(canvas => {
    canvas.addEventListener('pointermove', event => {
      const info = pointerInfo(canvas, event);
      if (!info) { hover.delete(canvas.id); $('tooltip').hidden = true; if (!playing) render(); return; }
      const count = info.sim.statistics.counts.get(info.opinion);
      hover.set(canvas.id, info.opinion);
      $('tooltip').innerHTML = `<strong>${info.index !== undefined ? `Agent ${info.index + 1} · ` : ''}Opinion ${info.opinion + 1}</strong>${count} supporter${count === 1 ? '' : 's'} · ${percent(count / n)} of agents`;
      $('tooltip').hidden = false;
      $('tooltip').style.left = `${Math.min(event.clientX + 12, innerWidth - 230)}px`;
      $('tooltip').style.top = `${Math.max(8, Math.min(event.clientY + 12, innerHeight - 70))}px`;
      if (!playing) render();
    });
    canvas.addEventListener('pointerleave', () => { hover.delete(canvas.id); $('tooltip').hidden = true; if (!playing) render(); });
    if (canvas.id === 'tutorial-agents') canvas.addEventListener('click', event => {
      if (pending) return;
      const info = pointerInfo(canvas, event); if (!info) return;
      target = info.index; $('target').value = target + 1; lastTrace = null; render();
    });
  });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); setView('compare'); });
  document.querySelectorAll('[data-protocol]').forEach(b => b.addEventListener('click', () => { if (protocol !== b.dataset.protocol) { protocol = b.dataset.protocol; reset(); } }));
  $('population').addEventListener('change', () => { n = Number($('population').value); reset(); });
  $('seed').addEventListener('change', () => {
    const value = Number($('seed').value);
    if (!Number.isInteger(value) || value < 0 || value > 4294967295) { $('seed').value = seed; announce('Enter a whole-number seed between 0 and 4294967295.'); return; }
    seed = value; reset();
  });
  $('reset').addEventListener('click', reset);
  $('play').addEventListener('click', togglePlay);
  $('step').addEventListener('click', () => { pause(); if (view === 'round') applyTutorial(); else advance(); render(); });
  $('tutorial-config').addEventListener('change', () => { resetTutorial(); render(); });
  $('target').addEventListener('change', () => { const value = Number($('target').value); target = Number.isFinite(value) ? Math.max(0, Math.min(n - 1, Math.floor(value) - 1)) : 0; $('target').value = target + 1; lastTrace = null; render(); });
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { announce('Fullscreen is unavailable here. Open this page in a browser tab or use the browser fullscreen command.'); }
  }
  $('fullscreen').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => { $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); render(); });
  $('about-button').addEventListener('click', () => { pause(); $('about').showModal(); });
  $('close-about').addEventListener('click', () => $('about').close());
  $('close-about-bottom').addEventListener('click', () => $('about').close());
  document.addEventListener('keydown', event => {
    if ($('about').open || event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); render(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); pause(); if (view === 'round') { if (pending) applyTutorial(); else drawSamples(); } else advance(); render(); }
    else if (event.key.toLowerCase() === 'r') reset();
    else if (event.key.toLowerCase() === 'f') fullscreen();
    else if (['1', '2', '3'].includes(event.key)) setView(allowedViews[Number(event.key) - 1]);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); render(); } });
  window.addEventListener('resize', render);
  window.addEventListener('hashchange', () => { const next = location.hash.slice(1).split('?')[0]; if (allowedViews.includes(next)) setView(next); });
  reset(); setView(view); requestAnimationFrame(frame);
})();
