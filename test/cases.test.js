import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { labelledCases, loadCaseSet, CASES_DIR } from '../src/decision/cases.js';
import { buildDecisionRequest } from '../src/decision/request.js';

// Everything the model is asked about each baseline payment, in order, with keys
// sorted. Reasons are left out: they are for people and never reach the model.
function fingerprint(cases) {
  const sorted = (v) => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  const asked = cases.map(({ id, tier, purpose, item, outside, req, ctx }) => ({ id, tier, purpose, item, outside, req, ctx }));
  return createHash('sha256').update(JSON.stringify(sorted(asked))).digest('hex');
}

test('baseline: moving the corpus into data changed nothing the model was asked', () => {
  // Taken from the in-code corpus before the move. If this fails, the baseline has
  // changed, and that is a re-baseline (AGENTS.md, rule 4), not a test to update.
  assert.equal(fingerprint(labelledCases()), 'a94b360370d0ba7dd883d5e3d91c0dc52d44b8ecb11d2338c86c642c535d3d0b');
});

const SETS = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));

test('every case file is well formed, and every borderline label has a reason', () => {
  assert.ok(SETS.includes('baseline'));
  const ids = new Set();
  for (const name of SETS) {
    for (const c of loadCaseSet(name)) {
      assert.ok(!ids.has(c.id), `${c.id} appears twice`);
      ids.add(c.id);
      assert.ok(c.tier === 'clear' || c.tier === 'hard', `${c.id}: tier ${c.tier}`);
      assert.ok(c.purpose && c.item && c.req.category, `${c.id}: purpose, item and category are required`);
      assert.ok(c.req.amount > 0 && c.req.mandate.maxPerTxn > 0 && c.req.mandate.maxTotal > 0, `${c.id}: amounts`);
      assert.equal(typeof c.ctx.unattended, 'boolean', `${c.id}: unattended`);
      if (c.tier === 'hard') {
        assert.equal(typeof c.reason, 'string', `${c.id}: a borderline label needs a reason`);
        assert.ok(c.reason.trim().length > 0 && !c.reason.includes('\n'), `${c.id}: the reason is one line`);
      }
    }
  }
});

test('every case file is in the one currency the request speaks', () => {
  for (const name of SETS) {
    const set = JSON.parse(readFileSync(new URL(`${name}.json`, CASES_DIR), 'utf8'));
    assert.equal(set.set, name, `${name}.json names itself`);
    assert.equal(set.currency, 'NZD', `${name}: buildDecisionRequest sends every amount as NZD`);
  }
});

test('a reason never reaches the model', () => {
  // The reason says why the label is what it is. Sent with the request, it would
  // hand the model the answer.
  for (const name of SETS) {
    for (const c of loadCaseSet(name).filter((x) => x.reason)) {
      const sent = JSON.stringify(buildDecisionRequest(c.req, c.ctx).wire);
      assert.ok(!sent.includes(c.reason), `${c.id}: reason found in the request`);
    }
  }
});
