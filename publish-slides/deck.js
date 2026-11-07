(function () {
  'use strict';
  const $ = id => document.getElementById(id), V = window.DeckVisuals, E = window.Consensus, M = window.DeckMath;
  const slides = [...document.querySelectorAll('.slide')];
  const lastBuild = slides.map(s => Math.max(0, ...[...s.querySelectorAll('[data-step]')].map(e => Number(e.dataset.step))));
  let index = 0, build = 0, exampleN = 100, comparisonProtocol = '3majority', comparisonScale = .13;
  let parameterKind = 'balanced', parameterFocus = 'm', pair = null;
  let pairRandom = E.rng(2026), comparisonA, comparisonB, proof;
  const seed = 2026, models = {}, timers = new Map();
  const protocolModels = { majority: '3majority', choices: '2choices', usd: 'usd' };
  const activeModel = () => ({ 1: 'majority', 2: 'choices', 8: 'compare', 9: 'usd', 11: 'proof' })[index];
  const parameterSim = () => new E.Simulation(100, parameterKind, '3majority', 25);
  const opinionName = i => i === -1 ? '⊥' : `opinion ${i + 1}`;
  const dot = i => `<span class="sample-dot" style="background:${V.color(i)};color:${i === -1 ? '#647181' : 'white'}">${i === -1 ? '⊥' : ''}</span>`;

  function fit() {
    const area = $('viewport'), scale = Math.min(area.clientWidth / 1280, area.clientHeight / 720);
    $('stage').style.transform = `translate(${(area.clientWidth - 1280 * scale) / 2}px, ${(area.clientHeight - 720 * scale) / 2}px) scale(${scale})`;
  }
  let resizeFrame = 0, renderedPixelRatio = devicePixelRatio;
  function resizeVisuals() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { fit(); renderAll(); });
  }
  function watchPixelRatio() {
    // A monitor change can leave CSS dimensions unchanged. Check the ratio
    // without repainting, including while a paused example is on screen.
    if (devicePixelRatio !== renderedPixelRatio) { renderedPixelRatio = devicePixelRatio; resizeVisuals(); }
    requestAnimationFrame(watchPixelRatio);
  }
  function stop(name) { if (timers.has(name)) clearInterval(timers.get(name)); timers.delete(name); updateButtons(); }
  function stopAll() { for (const timer of timers.values()) clearInterval(timer); timers.clear(); updateButtons(); }
  function finished(name) {
    if (name === 'compare') return comparisonA.statistics.consensus && comparisonB.statistics.consensus;
    if (name === 'proof') return proof.statistics.consensus;
    return models[name].sim.statistics.consensus;
  }
  function resetModel(name) {
    stop(name);
    if (name === 'compare') {
      comparisonA = new E.Simulation(exampleN, 'balanced', comparisonProtocol, (seed ^ 0x9e3779b9) >>> 0);
      comparisonB = new E.Simulation(exampleN, 'unbalanced', comparisonProtocol, (seed ^ 0x243f6a88) >>> 0);
      comparisonScale = Math.min(1, comparisonA.initial.m * 1.3);
    } else if (name === 'proof') proof = new E.Simulation(400, 'unbalanced', '3majority', (seed ^ 0x243f6a88) >>> 0);
    else models[name] = { sim: new E.Simulation(25, 'balanced', protocolModels[name], (seed ^ 0xb7e15162) >>> 0), target: 0, pending: null, last: null };
    if (comparisonA && comparisonB && proof && Object.keys(models).length === 3) renderModel(name);
  }
  function step(name) {
    if (finished(name)) { stop(name); return; }
    if (name === 'compare') {
      comparisonA.step(); comparisonB.step();
      comparisonScale = Math.max(comparisonScale, Math.min(1, Math.max(comparisonA.statistics.m, comparisonB.statistics.m) * 1.12));
    } else if (name === 'proof') proof.step();
    else {
      const m = models[name];
      const prepared = m.pending || m.sim.prepare(m.target);
      m.last = prepared.trace; m.sim.commit(prepared); m.pending = null;
    }
    renderModel(name);
    if (finished(name)) stop(name);
  }
  function toggleRun(name) {
    if (!name || finished(name)) return;
    if (timers.has(name)) { stop(name); return; }
    stopAll();
    timers.set(name, setInterval(() => step(name), name === 'compare' || name === 'proof' ? 220 : 480));
    updateButtons();
  }
  function sample(name) {
    const m = models[name]; if (!m || m.pending || finished(name)) return;
    stop(name); m.pending = m.sim.prepare(m.target); m.last = m.pending.trace; renderModel(name);
  }
  function roundLabel(id, sim) {
    const allUndecided = sim.protocol === 'usd' && sim.statistics.consensus && sim.statistics.leader === -1;
    $(id).textContent = allUndecided ? `All undecided · round ${sim.round}` : sim.statistics.consensus ? `Consensus · round ${sim.round}` : `Round ${sim.round}`;
    $(id).classList.toggle('finished', sim.statistics.consensus && !allUndecided);
  }
  function renderModel(name) {
    if (name === 'compare') {
      for (const [key, sim] of [['a', comparisonA], ['b', comparisonB]]) {
        roundLabel(`compare-${key}-round`, sim); V.grid(`compare-${key}-agents`, sim); V.histogram(`compare-${key}-bars`, sim, { max: comparisonScale, initialMax: sim.initial.m });
      }
      $('compare-initial').innerHTML = `n = ${exampleN.toLocaleString()} · ${M.inline('m_0=' + V.number(comparisonA.initial.m))} · seed ${seed}`;
    } else if (name === 'proof') {
      roundLabel('proof-round', proof); V.history('proof-history', proof);
      const s = proof.statistics, strong = s.m > 2 * s.gamma;
      const ratio = M.inline('\\frac{m}{\\gamma}=' + V.number(s.m / s.gamma));
      $('proof-regime').innerHTML = s.consensus ? 'Consensus: ' + M.inline('m=\\gamma=1') : strong ? M.inline('m>2\\gamma') + ' · ' + ratio : 'Comparable densities · ' + ratio;
      $('proof-regime').classList.toggle('balanced', !strong);
    } else {
      const m = models[name], t = m.last;
      roundLabel(`${name}-round`, m.sim); V.network(`${name}-network`, m.sim, m.target, m.pending ? t : null);
      let caption;
      if (!t) caption = `Inspect agent ${m.target + 1}: draw samples or run the system.`;
      else {
        let result;
        if (name === 'usd') result = t.before === -1 ? 'Copy sample' : t.after === -1 ? 'Become undecided' : 'Keep opinion';
        else if (name === 'choices') result = t.agree ? 'Agreement' : 'Keep opinion';
        else result = t.tie ? 'Uniform tie-break' : 'Sample majority';
        const samples = t.samples.map((opinion, j) => t.indices[j] === t.target
          ? `<span class="sample-self" title="The selected agent sampled itself">${dot(opinion)}<small>self</small></span>`
          : dot(opinion)).join('');
        caption = `Samples ${samples} <span class="sample-result">${result} → ${dot(t.after)}</span>`;
      }
      $(`${name}-samples`).innerHTML = caption;
      if (m.sim.statistics.consensus && m.sim.statistics.leader === -1) $(`${name}-samples`).textContent = 'All-⊥ is an absorbing failure state, not opinion consensus.';
    }
    updateButtons();
  }
  function updateButtons() {
    if (!comparisonA || !comparisonB || !proof || Object.keys(models).length < 3) return;
    for (const b of document.querySelectorAll('[data-demo-action]')) {
      const name = b.dataset.model, action = b.dataset.demoAction, done = finished(name);
      b.disabled = action !== 'reset' && done;
      if (action === 'sample') b.disabled ||= !!models[name].pending;
      if (action === 'apply') b.disabled ||= !models[name].pending;
      if (action === 'run') { b.textContent = timers.has(name) ? 'Pause' : 'Run'; b.setAttribute('aria-pressed', String(timers.has(name))); }
    }
  }
  function renderParameters() {
    const sim = parameterSim(), s = sim.statistics;
    V.histogram('parameter-histogram', sim, { max: .13, focus: parameterFocus, pair });
    $('parameter-k').textContent = V.number(1 / s.k); $('parameter-gamma').textContent = V.number(s.gamma); $('parameter-m').textContent = V.number(s.m);
    $('parameter-balanced').setAttribute('aria-pressed', String(parameterKind === 'balanced'));
    $('parameter-unbalanced').setAttribute('aria-pressed', String(parameterKind === 'unbalanced'));
    document.querySelectorAll('[data-parameter]').forEach(b => { b.classList.toggle('selected', b.dataset.parameter === parameterFocus); b.setAttribute('aria-pressed', String(b.dataset.parameter === parameterFocus)); });
  }
  function renderExample() {
    for (const kind of ['balanced', 'unbalanced']) { const sim = new E.Simulation(exampleN, kind, '3majority', 33); V.histogram(`example-${kind}`, sim, { max: sim.initial.m * 1.3, initialMax: sim.initial.m }); }
  }
  function renderAll() { V.title(); renderParameters(); renderExample(); for (const name of ['majority', 'choices', 'usd', 'compare', 'proof']) renderModel(name); }

  function parsedHash() {
    const match = location.hash.match(/^#(\d+)(?:\/(\d+))?$/);
    if (match) return [Number(match[1]) - 1, Number(match[2] || 0)];
    const legacy = { compare: 8, round: 1, proof: 11 }[location.hash.slice(1).split('?')[0]];
    return [legacy ?? 0, 0];
  }
  function goTo(next, nextBuild = 0) {
    stopAll();
    index = Math.max(0, Math.min(slides.length - 1, next)); build = Math.max(0, Math.min(lastBuild[index], nextBuild));
    slides.forEach((slide, i) => { slide.hidden = i !== index; slide.setAttribute('aria-hidden', String(i !== index)); });
    for (const part of slides[index].querySelectorAll('[data-step]')) { const visible = Number(part.dataset.step) <= build; part.classList.toggle('visible', visible); part.setAttribute('aria-hidden', String(!visible)); }
    $('slide-count').textContent = `${index + 1} / ${slides.length}`; $('build-count').textContent = lastBuild[index] ? `${build + 1}/${lastBuild[index] + 1}` : '';
    $('previous').disabled = index === 0 && build === 0; $('next').disabled = index === slides.length - 1 && build === lastBuild[index];
    document.querySelectorAll('[data-slide]').forEach(b => { const n = Number(b.dataset.slide); b.classList.toggle('current', n === index); b.classList.toggle('past', n < index); });
    try { history.replaceState(null, '', `#${index + 1}${build ? '/' + build : ''}`); } catch {}
    document.title = `${index + 1}. ${slides[index].dataset.title} · DISC 2026`;
    $('live-announcement').textContent = `Slide ${index + 1} of ${slides.length}: ${slides[index].dataset.title}`;
    if (activeModel()) renderModel(activeModel());
  }
  function next() { if (build < lastBuild[index]) goTo(index, build + 1); else if (index < slides.length - 1) goTo(index + 1); }
  function previous() { if (build > 0) goTo(index, build - 1); else if (index > 0) goTo(index - 1, lastBuild[index - 1]); }
  function openDialog(id) { stopAll(); $(id).showModal(); }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { $('live-announcement').textContent = 'Use your browser fullscreen command if fullscreen is unavailable here.'; }
  }

  $('progress').innerHTML = slides.map((s, i) => `<button data-slide="${i}" aria-label="Slide ${i + 1}: ${s.dataset.title.replaceAll('&', '&amp;')}" title="${i + 1}. ${s.dataset.title.replaceAll('&', '&amp;')}"></button>`).join('');
  $('overview-grid').innerHTML = slides.map((s, i) => `<button data-slide="${i}"><small>${String(i + 1).padStart(2, '0')} · ${s.dataset.section}</small><strong>${s.dataset.title}</strong></button>`).join('');
  document.querySelectorAll('[data-slide]').forEach(b => b.addEventListener('click', () => { $('overview-dialog').close(); goTo(Number(b.dataset.slide)); }));
  $('previous').addEventListener('click', previous); $('next').addEventListener('click', next);
  $('overview-button').addEventListener('click', () => openDialog('overview-dialog'));
  $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('fullscreen-button').addEventListener('click', fullscreen);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
  document.querySelectorAll('[data-demo-action]').forEach(b => b.addEventListener('click', () => {
    const name = b.dataset.model;
    switch (b.dataset.demoAction) {
      case 'sample': sample(name); break;
      case 'apply': if (models[name].pending) step(name); break;
      case 'step': stop(name); step(name); break;
      case 'run': toggleRun(name); break;
      case 'reset': resetModel(name); break;
    }
  }));
  for (const name of Object.keys(protocolModels)) $(`${name}-network`).addEventListener('click', e => {
    const m = models[name]; if (m.pending) return;
    const canvas = e.currentTarget, box = canvas.getBoundingClientRect(), x = (e.clientX - box.left) * canvas._size.w / box.width, y = (e.clientY - box.top) * canvas._size.h / box.height;
    const target = canvas._points.findIndex(p => Math.hypot(x - p.x, y - p.y) <= p.r + 7);
    if (target >= 0) { stop(name); m.target = target; m.last = null; renderModel(name); }
  });
  for (const kind of ['balanced', 'unbalanced']) $(`parameter-${kind}`).addEventListener('click', () => { parameterKind = kind; pair = null; pairRandom = E.rng(2026); $('collision-result').innerHTML = 'Two independent samples agree with probability ' + M.inline('\\gamma_0') + '.'; renderParameters(); });
  document.querySelectorAll('[data-parameter]').forEach(b => b.addEventListener('click', () => { parameterFocus = b.dataset.parameter; renderParameters(); }));
  $('draw-pair').addEventListener('click', () => {
    const sim = parameterSim(); pair = [sim.agents[Math.floor(pairRandom() * 100)], sim.agents[Math.floor(pairRandom() * 100)]]; parameterFocus = 'gamma';
    $('collision-result').innerHTML = `${dot(pair[0])}${dot(pair[1])} ${pair[0] === pair[1] ? 'Same opinion' : 'Different opinions'} · ${M.inline('\\gamma_0=' + V.number(sim.statistics.gamma))}`; renderParameters();
  });
  $('example-size').addEventListener('change', () => { exampleN = Number($('example-size').value); resetModel('compare'); renderExample(); });
  $('compare-protocol').addEventListener('change', () => { comparisonProtocol = $('compare-protocol').value; resetModel('compare'); });
  $('print-deck').addEventListener('click', () => { $('help-dialog').close(); stopAll(); renderAll(); window.print(); });
  window.addEventListener('beforeprint', () => { stopAll(); renderAll(); });
  window.addEventListener('resize', resizeVisuals);
  watchPixelRatio();
  window.addEventListener('hashchange', () => goTo(...parsedHash()));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space' && document.activeElement.tagName === 'BUTTON') return;
    if (e.key === 'ArrowRight' || e.code === 'Space') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); previous(); }
    else if (e.key === 'PageDown') { e.preventDefault(); goTo(index + 1); }
    else if (e.key === 'PageUp') { e.preventDefault(); goTo(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
    else if (e.key.toLowerCase() === 'o') openDialog('overview-dialog');
    else if (e.key.toLowerCase() === 'f') fullscreen();
    else if (e.key.toLowerCase() === 'd') toggleRun(activeModel());
    else if (e.key.toLowerCase() === 'r' && activeModel()) resetModel(activeModel());
    else if (e.key === '?') openDialog('help-dialog');
  });
  for (const name of ['majority', 'choices', 'usd', 'compare', 'proof']) resetModel(name);
  fit(); renderAll(); goTo(...parsedHash());
})();
