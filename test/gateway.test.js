import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrincipal, issueMandate, attest, checkScope, signatureValid } from '../src/gateway/mandate.js';
import { IdempotencyStore, intentKey } from '../src/gateway/idempotency.js';
import { decide, posterior } from '../src/gateway/risk.js';
import { Ledger } from '../src/gateway/ledger.js';
import { Gateway } from '../src/gateway/pipeline.js';
import { ECONOMICS, BEHAVIOUR, controlsFor } from '../src/assumptions.js';
import { createRng } from '../src/rng.js';

const alice = createPrincipal('alice');
const mallory = createPrincipal('mallory');
const fields = { id: 'm1', agentId: 'a1', categories: ['in_scope'], maxPerTxn: 100, maxTotal: 250, expiresAt: 1000 };
const reg = new Map([['alice', alice.publicKeyPem]]);

// --- Mandate -----------------------------------------------------------------
test('mandate: a genuine mandate attests', () => {
  assert.deepEqual(attest(issueMandate(alice, fields), reg), { ok: true });
});

test('mandate: forged mandate is a valid signature from the wrong key', () => {
  const forged = issueMandate({ name: 'alice', privateKey: mallory.privateKey, publicKeyPem: mallory.publicKeyPem }, fields);
  assert.equal(signatureValid(forged), true, 'the signature itself verifies');
  assert.equal(attest(forged, reg).reason, 'key_mismatch', 'the registry is what catches it');
});

test('mandate: raising the budget after signing breaks the signature', () => {
  const m = { ...issueMandate(alice, fields), maxTotal: 1e6 };
  assert.equal(attest(m, reg).reason, 'bad_signature');
});

test('mandate: scope, cap, budget and expiry are each enforced', () => {
  const m = issueMandate(alice, fields);
  assert.equal(checkScope(m, { category: 'in_scope', amount: 50 }, 0, 0).ok, true);
  assert.equal(checkScope(m, { category: 'gift_cards', amount: 50 }, 0, 0).reason, 'out_of_scope');
  assert.equal(checkScope(m, { category: 'in_scope', amount: 101 }, 0, 0).reason, 'over_per_txn_cap');
  assert.equal(checkScope(m, { category: 'in_scope', amount: 60 }, 200, 0).reason, 'over_budget');
  assert.equal(checkScope(m, { category: 'in_scope', amount: 50 }, 0, 1001).reason, 'mandate_expired');
});

// --- Idempotency ---------------------------------------------------------------
test('idempotency: replay, in-flight and conflict are distinguished', () => {
  const s = new IdempotencyStore();
  assert.equal(s.begin('k', 'p').kind, 'new');
  assert.equal(s.begin('k', 'p').kind, 'in_flight');
  s.complete('k', { status: 'approved' });
  assert.deepEqual(s.begin('k', 'p'), { kind: 'replay', result: { status: 'approved' } });
  assert.equal(s.begin('k', 'different payload').kind, 'conflict');
});

test('idempotency: the intent key ignores the client key and the attempt number', () => {
  const base = { mandate: { id: 'm1' }, merchantId: 'x', cartId: 'c', amount: 10 };
  assert.equal(intentKey({ ...base, idempotencyKey: 'a', attempt: 0 }), intentKey({ ...base, idempotencyKey: 'b', attempt: 3 }));
  assert.notEqual(intentKey(base), intentKey({ ...base, amount: 10.01 }));
});

// --- Risk ------------------------------------------------------------------------
const riskBase = { amount: 80, fee: 0.3, merchantMargin: 0.3, chargebackFee: 15, stepUpCompletion: 0.9, stepUpCatch: 0.9 };
test('risk: action follows expected value as fraud probability rises', () => {
  assert.equal(decide({ ...riskBase, pFraud: 0.001 }).action, 'approve');
  assert.equal(decide({ ...riskBase, pFraud: 0.15 }).action, 'step_up');
  assert.equal(decide({ ...riskBase, pFraud: 0.9 }).action, 'decline');
});

test('risk: a challenge nobody can answer is never chosen over declining', () => {
  const d = decide({ ...riskBase, stepUpCompletion: 0, pFraud: 0.5 });
  assert.equal(d.action, 'decline');
});

test('risk: the chosen action always has the highest expected value', () => {
  const rng = createRng(3);
  for (let i = 0; i < 500; i++) {
    const d = decide({ ...riskBase, amount: 1 + rng.next() * 500, pFraud: rng.next(), stepUpCompletion: rng.next() });
    const best = Math.max(d.ev.approve, d.ev.stepUp, d.ev.decline);
    const key = d.action === 'step_up' ? 'stepUp' : d.action;
    assert.equal(d.ev[key], best);
  }
});

test('risk: posterior rises with the evidence', () => {
  assert.ok(posterior(0.03, 2, 1.6) > posterior(0.03, 0, 1.6));
});

// --- Ledger ----------------------------------------------------------------------
test('ledger: rejects capture without authorisation and refund beyond capture', () => {
  const l = new Ledger();
  assert.throws(() => l.capture('p1', 10, 0.1), /without authorisation/);
  l.authorise('p1', 10);
  assert.throws(() => l.capture('p1', 11, 0.1), /exceeds authorisation/);
  l.capture('p1', 10, 0.1);
  assert.throws(() => l.refund('p1', 10.01), /exceeds capture/);
  assert.throws(() => l.authorise('p1', 10), /duplicate payment id/);
});

test('ledger: stays balanced under 5,000 random operations', () => {
  const rng = createRng(42);
  const l = new Ledger();
  const ids = [];
  for (let i = 0; i < 5000; i++) {
    const op = rng.int(3);
    try {
      if (op === 0) {
        const id = `p${i}`;
        const amount = Math.round(rng.next() * 30000) / 100 + 0.5;
        l.authorise(id, amount);
        l.capture(id, amount, Math.round(amount * 2.5) / 1000 + 0.1);
        ids.push([id, amount]);
      } else if (ids.length) {
        const [id, amount] = rng.pick(ids);
        l.refund(id, op === 1 ? amount : amount * 2);
      }
    } catch {
      // Rejected operations must leave the books untouched.
    }
    if (i % 250 === 0) l.assertInvariants();
  }
  assert.equal(l.assertInvariants(), true);
});

// --- Pipeline --------------------------------------------------------------------
function harness(bets, script, extra = {}) {
  const responses = [...script];
  const world = {
    expectedChallengeCompletion: () => 1,
    challenge: () => true,
    issuerRequiresSca: () => false,
    issuerAuthorise: () => responses.shift() ?? 'approved',
  };
  const gateway = new Gateway({
    controls: { ...controlsFor(bets), ...extra },
    registry: reg,
    world,
    economics: ECONOMICS,
    behaviour: BEHAVIOUR,
    now: () => 0,
  });
  const req = {
    intentId: 'i1', attempt: 0, isAgent: true, payerId: 'a1', mandate: issueMandate(alice, fields),
    merchantId: 'shop', cartId: 'cart', category: 'in_scope', amount: 40, aggregated: false,
    dialect: 'core', idempotencyKey: 'k0', riskScore: 0,
  };
  const charges = () => (gateway.captures.get('i1') ?? []).length;
  return { gateway, req, charges };
}
const retryWithNewKey = (h) => {
  h.req.attempt++;
  h.req.idempotencyKey = `k${h.req.attempt}`;
  return h.gateway.handle(h.req);
};

test('pipeline: lost response + retry with a fresh key charges the card twice', () => {
  const h = harness([], ['timeout_ok', 'approved']);
  assert.equal(h.gateway.handle(h.req).status, 'unknown');
  assert.equal(retryWithNewKey(h).status, 'approved');
  h.gateway.settleLate();
  assert.equal(h.charges(), 2);
});

test('pipeline: intent-derived idempotency alone collapses the retry', () => {
  const h = harness([], ['timeout_ok', 'approved'], { intentIdempotency: true });
  h.gateway.handle(h.req);
  assert.equal(retryWithNewKey(h).status, 'pending');
  h.gateway.settleLate();
  assert.equal(h.charges(), 1);
});

test('pipeline: a status inquiry alone resolves the ambiguity', () => {
  const h = harness([], ['timeout_ok'], { retryBudget: true });
  assert.equal(h.gateway.handle(h.req).reason, 'resolved_by_inquiry');
  assert.equal(h.charges(), 1);
});

test('pipeline: a definitive failure may be retried once, then the budget stops it', () => {
  const h = harness([], ['timeout_fail', 'timeout_fail', 'approved'], { retryBudget: true });
  assert.equal(h.gateway.handle(h.req).reason, 'timeout_definitive');
  assert.equal(retryWithNewKey(h).reason, 'timeout_definitive');
  assert.equal(retryWithNewKey(h).reason, 'retry_budget_exhausted');
  assert.equal(h.charges(), 0);
});

test('pipeline: the breaker opens on sustained timeouts and keeps retries off the issuer', () => {
  const h = harness([], [], { retryBudget: true });
  // 60 different payments, every one timing out.
  for (let i = 0; i < 60; i++) {
    h.gateway.world.issuerAuthorise = () => 'timeout_fail';
    h.gateway.handle({ ...h.req, intentId: `warm${i}`, cartId: `warm${i}`, idempotencyKey: `w${i}` });
  }
  assert.equal(h.gateway.breakerOpen(), true);
  const before = h.gateway.issuerCalls;
  h.gateway.handle(h.req); // first attempt is still allowed through
  assert.equal(retryWithNewKey(h).reason, 'circuit_open');
  assert.equal(h.gateway.issuerCalls, before + 2, 'one authorisation and its status inquiry, no retry');
});

test('pipeline: double-fire is only caught by intent idempotency, not by the retry budget', () => {
  const budgetOnly = harness([], [], { retryBudget: true });
  budgetOnly.gateway.handle(budgetOnly.req);
  retryWithNewKey(budgetOnly);
  assert.equal(budgetOnly.charges(), 2);

  const intent = harness([], [], { intentIdempotency: true });
  intent.gateway.handle(intent.req);
  assert.equal(retryWithNewKey(intent).replayed, true);
  assert.equal(intent.charges(), 1);
});

test('pipeline: a replay does not spend the mandate budget twice', () => {
  const h = harness(['mandate', 'storm'], []);
  h.gateway.handle(h.req);
  for (let i = 0; i < 10; i++) retryWithNewKey(h);
  assert.equal(h.gateway.spent.get('m1'), 40);
});

test('pipeline: a forged mandate passes without attestation and is stopped with it', () => {
  const forged = issueMandate({ name: 'alice', privateKey: mallory.privateKey, publicKeyPem: mallory.publicKeyPem }, fields);
  const open = harness([], []);
  open.req.mandate = forged;
  assert.equal(open.gateway.handle(open.req).status, 'approved');
  const closed = harness(['rails'], []);
  closed.req.mandate = forged;
  assert.deepEqual([closed.gateway.handle(closed.req).status, closed.charges()], ['rejected', 0]);
});

test('pipeline: an unsupported dialect never reaches the issuer', () => {
  const h = harness([], []);
  h.req.dialect = 'common';
  assert.equal(h.gateway.handle(h.req).reason, 'unsupported_protocol');
  assert.equal(h.gateway.issuerCalls, 0);
});
