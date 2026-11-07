/* Pure synchronous simulation, shared by the browser and the Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Consensus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function rng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function initial(n, kind, random = rng(1)) {
    const side = Math.sqrt(n);
    if (!Number.isInteger(side) || n < 4) throw new Error('n must be a perfect square, at least 4.');
    if (!['balanced', 'unbalanced'].includes(kind)) throw new Error('Unknown initial configuration.');
    const agents = new Uint32Array(n);
    for (let j = 0; j < n; j++) agents[j] = kind === 'balanced' ? Math.floor(j / side) : (j < side ? 0 : j - side + 1);
    // Positions have no effect on the complete graph. Shuffle for the agent view.
    for (let j = n - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1));
      [agents[j], agents[k]] = [agents[k], agents[j]];
    }
    return agents;
  }

  function stats(agents) {
    const counts = new Map();
    for (const opinion of agents) counts.set(opinion, (counts.get(opinion) || 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const n = agents.length;
    const gamma = ranked.reduce((s, [, c]) => s + (c / n) ** 2, 0);
    return { n, k: counts.size, m: ranked[0][1] / n, gamma, leader: ranked[0][0], largestCount: ranked[0][1], counts, ranked, consensus: counts.size === 1 };
  }

  function updateOpinion(old, samples, protocol, tieRandom = Math.random) {
    if (protocol === 'usd') {
      if (samples.length !== 1) throw new Error('USD needs one sample.');
      const sampled = samples[0];
      if (old === -1) return sampled;
      return sampled !== -1 && sampled !== old ? -1 : old;
    }
    if (protocol === '2choices') {
      if (samples.length !== 2) throw new Error('2-Choices needs two samples.');
      return samples[0] === samples[1] ? samples[0] : old;
    }
    if (protocol !== '3majority' || samples.length !== 3) throw new Error('Unknown protocol or wrong sample size.');
    const [a, b, c] = samples;
    if (a === b || a === c) return a;
    if (b === c) return b;
    return samples[Math.floor(tieRandom() * 3)];
  }

  function computeRound(agents, protocol, random, traceTarget = -1) {
    if (!['2choices', '3majority', 'usd'].includes(protocol)) throw new Error('Unknown protocol.');
    const next = protocol === 'usd' ? new Int32Array(agents.length) : new Uint32Array(agents.length);
    const sampleCount = protocol === '3majority' ? 3 : protocol === '2choices' ? 2 : 1;
    let trace = null;
    // Every update reads the OLD array. All updates commit together.
    for (let j = 0; j < agents.length; j++) {
      const indices = Array.from({ length: sampleCount }, () => Math.floor(random() * agents.length));
      const samples = indices.map(k => agents[k]);
      const after = updateOpinion(agents[j], samples, protocol, random);
      next[j] = after;
      if (j === traceTarget) trace = { target: j, indices, samples, before: agents[j], after,
        tie: protocol === '3majority' && new Set(samples).size === 3,
        agree: samples[0] === samples[1] };
    }
    return { next, trace };
  }

  class Simulation {
    constructor(n, kind, protocol, seed) {
      this.protocol = protocol;
      this.random = rng(seed);
      this.agents = initial(n, kind, rng((seed ^ 0x85ebca6b) >>> 0));
      this.round = 0;
      this.statistics = stats(this.agents);
      this.initial = { ...this.statistics };
      this.history = [this.point()];
      this.finishedAt = null;
    }
    point() {
      const { m, gamma, k } = this.statistics;
      return { round: this.round, m, gamma, k };
    }
    prepare(target = -1) {
      if (this.statistics.consensus) return null;
      return computeRound(this.agents, this.protocol, this.random, target);
    }
    commit(prepared) {
      if (!prepared || this.statistics.consensus) return false;
      this.agents = prepared.next;
      this.round++;
      this.statistics = stats(this.agents);
      this.history.push(this.point());
      if (this.statistics.consensus) this.finishedAt = this.round;
      return true;
    }
    step() { return this.commit(this.prepare()); }
  }

  return { rng, initial, stats, updateOpinion, computeRound, Simulation };
});
