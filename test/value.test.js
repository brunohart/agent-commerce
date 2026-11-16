import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, triangularQuantile } from '../src/rng.js';
import { interpolate, SHARE_GRID, TICKET_GRID, allPortfolios, portfolioKey, buildSurface } from '../src/value/surface.js';
import { jevonsMultiplier, evaluate, inputsAtQuantile, monteCarlo, sequence, sampleInputs } from '../src/value/model.js';
import { JEVONS_CAP, BET_KEYS, SEGMENTS } from '../src/assumptions.js';

// A synthetic surface where every portfolio earns `net` per intent everywhere.
const flat = (netFor) => {
  const surface = {};
  for (const seg of Object.keys(SEGMENTS)) {
    surface[seg] = {};
    for (const bets of allPortfolios()) {
      const grid = (v) => SHARE_GRID.map(() => TICKET_GRID.map(() => v));
      surface[seg][portfolioKey(bets)] = { net: grid(netFor(bets)), mlr: grid(0.002), cliff: grid(0) };
    }
  }
  return surface;
};

test('rng: triangular quantiles stay inside their bounds and hit the mode region', () => {
  assert.equal(triangularQuantile(0, 1, 2, 5), 1);
  assert.equal(triangularQuantile(1, 1, 2, 5), 5);
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = rng.triangular(1, 2, 5);
    assert.ok(v >= 1 && v <= 5);
  }
});

test('jevons: no friction change means no extra volume; cheaper means more; capped', () => {
  assert.equal(jevonsMultiplier(1, 0.8), 1);
  assert.equal(jevonsMultiplier(0.25, 0), 1);
  assert.ok(jevonsMultiplier(0.25, 0.8) > jevonsMultiplier(0.5, 0.8));
  assert.equal(jevonsMultiplier(0.001, 3), JEVONS_CAP);
});

test('surface: interpolation returns grid values at grid points and clamps outside', () => {
  const table = SHARE_GRID.map((s, i) => TICKET_GRID.map((t, j) => i * 10 + j));
  SHARE_GRID.forEach((s, i) => TICKET_GRID.forEach((t, j) => assert.ok(Math.abs(interpolate(table, s, t) - (i * 10 + j)) < 1e-9)));
  assert.equal(interpolate(table, 5, 1), interpolate(table, SHARE_GRID.at(-1), 1));
  assert.equal(interpolate(table, 0, 0.01), interpolate(table, 0, TICKET_GRID.at(-1)));
});

test('value: a bet that changes nothing is worth exactly minus its cost', () => {
  const surface = flat(() => 0.1);
  const x = inputsAtQuantile(0.5);
  const none = evaluate(x, [], surface);
  const storm = evaluate(x, ['storm'], surface);
  assert.ok(Math.abs(storm.operating - none.operating) < 1e-9);
  assert.ok(Math.abs(storm.total - none.total + storm.build + storm.run) < 1e-9);
});

test('value: not being agent-ready erodes volume as agent share grows', () => {
  const surface = flat(() => 0.1);
  const lo = inputsAtQuantile(0.5, { erosion: 0 });
  const hi = inputsAtQuantile(0.5, { erosion: 1 });
  assert.ok(evaluate(hi, [], surface).operating < evaluate(lo, [], surface).operating);
  assert.equal(evaluate(hi, ['rails'], surface).operating, evaluate(lo, ['rails'], surface).operating);
});

test('value: the Jevons term adds volume, and can be switched off', () => {
  const surface = flat(() => 0.1);
  const x = inputsAtQuantile(0.5);
  assert.ok(evaluate(x, ['rails'], surface).operating > evaluate(x, ['rails'], surface, { jevons: false }).operating);
});

test('value: monte carlo is reproducible and ranks a dominant portfolio first', () => {
  const surface = flat((bets) => (bets.includes('storm') ? 0.5 : 0.1));
  const a = monteCarlo(surface, { draws: 300, seed: 9 });
  const b = monteCarlo(surface, { draws: 300, seed: 9 });
  assert.deepEqual(a.portfolios.map((p) => p.mean), b.portfolios.map((p) => p.mean));
  const top = [...a.portfolios].sort((p, q) => q.mean - p.mean)[0];
  // Rails also earns its place (it stops erosion). Mandate and micro add only cost.
  assert.ok(top.bets.includes('storm') && !top.bets.includes('mandate') && !top.bets.includes('micro'), top.key);
  assert.equal(sequence(a)[0].bet, 'storm');
  assert.ok(Math.abs(a.portfolios.reduce((s, p) => s + p.pBest, 0) - 1) < 1e-9);
});

test('value: every sampled input is inside its prior', () => {
  const x = sampleInputs(createRng(2));
  assert.ok(x['elasticity.unattended'] >= 0.2 && x['elasticity.unattended'] <= 1.2);
  assert.equal(Object.keys(x).length, 8 + 4 + 2 * BET_KEYS.length);
});

test('end to end: a small real surface produces a full decision', () => {
  const surface = buildSurface({ intents: 1200, seeds: 1 });
  const mc = monteCarlo(surface, { draws: 200 });
  assert.equal(mc.portfolios.length, 16);
  assert.equal(mc.portfolios.find((p) => p.key === 'none').mean, 0);
  assert.ok(mc.portfolios.every((p) => Number.isFinite(p.mean) && p.p05 <= p.p95));
});
