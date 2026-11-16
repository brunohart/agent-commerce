import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { labelledCases } from '../src/decision/cases.js';
import { measure, auc, separationFromAuc, saveMeasured, measuredDials } from '../src/decision/measure.js';
import { buildDecisionRequest, parseAnswers, PINNED_MODEL } from '../src/decision/request.js';
import { createRng } from '../src/rng.js';

test('wire format: matches the documented request and response shapes', () => {
  const c = labelledCases()[0];
  const { wire } = buildDecisionRequest(c.req, c.ctx);
  assert.match(wire.model, /^jev-\d+\.\d+\.\d+$/, 'a full, pinned model id');
  for (const q of Object.values(wire.questions)) {
    assert.equal(q.type, 'noul');
    assert.equal(typeof q.instructions, 'string');
    assert.equal(q.question, undefined);
  }
  assert.deepEqual(Object.keys(wire.questions.outside_mandate.criteria), ['true', 'false']);

  // The response example from TypeSafe's quick start, trimmed to our two questions.
  const documented = {
    model: 'jev-1.14.0',
    answers: { unauthorised: { type: 'noul', noul: 0.02 }, outside_mandate: { type: 'noul', noul: 0.99 } },
    usage: { input_tokens: 428, output_tokens: 73 },
  };
  assert.deepEqual(parseAnswers(documented), { unauthorised: 0.02, outside_mandate: 0.99 });
  assert.equal(documented.model, PINNED_MODEL, 'the guard compares against the id the API actually returns');
});

test('cases: balanced, labelled, and each builds a request', () => {
  const cases = labelledCases();
  assert.equal(cases.length, 234);
  assert.equal(cases.filter((c) => c.outside).length, 117);
  assert.equal(cases.filter((c) => c.tier === 'hard').length, 72);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    const { wire } = buildDecisionRequest(c.req, c.ctx);
    assert.ok(wire.state.mandate.purpose && wire.state.item.description);
  }
});

test('auc: perfect ranking is 1, a coin is a half, and separation inverts it', () => {
  assert.equal(auc([[0.9, 1], [0.8, 1], [0.2, 0], [0.1, 0]]), 1);
  assert.equal(auc([[0.5, 1], [0.5, 0]]), 0.5);
  assert.ok(Math.abs(separationFromAuc(0.94) - 2.2) < 0.05);
  assert.ok(separationFromAuc(0.5) < 0.01);
});

// A fake model: knows the label, adds noise, sometimes fails.
function fakeClient({ skill = 2.5, failEvery = 0, latency = 150 } = {}) {
  const rng = createRng(4);
  const labels = new Map(labelledCases().map((c) => [c.id, c.outside]));
  let n = 0;
  return {
    async decide(request) {
      n++;
      if (failEvery && n % failEvery === 0) return { ok: false, error: 'http_529', latencyMs: 20 };
      const z = rng.normal() + (labels.get(request.ref) ? skill : 0) - skill / 2;
      const p = 1 / (1 + Math.exp(-2 * z));
      return { ok: true, p: { unauthorised: 0.01, outside_mandate: p }, version: PINNED_MODEL, latencyMs: latency * Math.exp(0.3 * rng.normal()) };
    },
  };
}

test('measure: turns real answers into the dials the simulator uses', async () => {
  const m = await measure({ client: fakeClient(), cases: labelledCases() });
  assert.equal(m.ok, true);
  assert.equal(m.answered, 234);
  assert.deepEqual(Object.keys(m.byTier).sort(), ['clear', 'hard']);
  assert.equal(m.cases.length, 234);
  assert.ok(m.quality.auc > 0.9 && m.quality.auc <= 1);
  assert.ok(m.dials.separation > 1.8);
  assert.ok(m.dials.slope > 0);
  assert.ok(Math.abs(m.dials.latencyMedianMs - 150) < 30);
  assert.equal(m.dials.outage, 0);
  assert.deepEqual(Object.keys(m.versions), [PINNED_MODEL]);
});

test('measure: failed calls become the outage rate, and too few answers is not a measurement', async () => {
  const m = await measure({ client: fakeClient({ failEvery: 4 }), cases: labelledCases() });
  assert.ok(Math.abs(m.dials.outage - 0.25) < 0.02);
  assert.ok(m.errors.http_529 > 30);
  const dead = await measure({ client: { decide: async () => ({ ok: false, error: 'network', latencyMs: 1 }) }, cases: labelledCases() });
  assert.equal(dead.ok, false);
});

test('measured dials: absent until measured, then read back', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'jev-')), 'jev-measured.json');
  assert.equal(measuredDials(path), null);
  const m = await measure({ client: fakeClient(), cases: labelledCases() });
  saveMeasured(m, path);
  assert.deepEqual(measuredDials(path), m.dials);
  // The repo ships a real measurement. Whatever it says, it has to be usable.
  const shipped = measuredDials();
  if (shipped) {
    assert.ok(shipped.separation > 0.3 && shipped.separation <= 3.5);
    assert.ok(shipped.latencyMedianMs > 0 && shipped.outage >= 0 && shipped.outage < 1);
    if ('slope' in shipped) assert.ok(shipped.slope >= 0.25 && shipped.slope <= 4);
  }
});
