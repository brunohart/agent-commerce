import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayKey, issueReceipt, verifyReceipt, receiptLeaf, stable } from '../src/receipt/receipt.js';
import { ReceiptLog, verifyInclusion } from '../src/receipt/log.js';
import { evaluateThesis, thesisMonteCarlo, requiredShare, THESIS_PRIORS } from '../src/value/thesis.js';
import { Gateway } from '../src/gateway/pipeline.js';
import { GuardedDecider } from '../src/decision/guard.js';
import { PINNED_MODEL } from '../src/decision/request.js';
import { createPrincipal, issueMandate } from '../src/gateway/mandate.js';
import { ECONOMICS, BEHAVIOUR, controlsFor } from '../src/assumptions.js';
import { simulate } from '../src/sim/simulate.js';

const key = createGatewayKey();
const wire = {
  model: PINNED_MODEL,
  state: { payment: { amount: 120, currency: 'NZD' }, item: { description: 'prepaid Visa card' } },
  questions: { outside_mandate: { type: 'noul', instructions: 'Is the item outside the mandate purpose?' } },
};
const mandate = { id: 'm1', signature: 'c2lnbmF0dXJl' };
const make = () =>
  issueReceipt({
    key, paymentId: 'p1#0', issuedAt: 42, wire, mandate,
    answer: { stated: { outside_mandate: 0.92 }, p: { outside_mandate: 0.97 }, version: PINNED_MODEL },
    decision: { action: 'decline', ev: { approve: -121.8, stepUp: -10.1, decline: 0 } },
  });

// --- Receipt ---------------------------------------------------------------------
test('receipt: verifies with nothing but the gateway’s public key', () => {
  assert.deepEqual(verifyReceipt(make(), key.publicKeyPem), { ok: true });
});

test('receipt: changing any field, however small, breaks it', () => {
  const r = make();
  for (const tampered of [
    { ...r, action: 'approve' },
    { ...r, calibrated: { outside_mandate: 0.02 } },
    { ...r, issuedAt: 41 },
    { ...r, model: 'jev-latest' },
    { ...r, mandate: { ...r.mandate, id: 'm2' } },
  ]) {
    assert.equal(verifyReceipt(tampered, key.publicKeyPem).reason, 'bad_signature');
  }
  assert.equal(verifyReceipt(r, createGatewayKey().publicKeyPem).reason, 'bad_signature', 'another gateway’s key');
});

test('receipt: commits to the state without containing it, and checks it when revealed', () => {
  const r = make();
  assert.equal(JSON.stringify(r).includes('prepaid Visa card'), false, 'the payment details are not in the receipt');
  assert.deepEqual(verifyReceipt(r, key.publicKeyPem, { wire, mandate }), { ok: true });
  const edited = { ...wire, state: { ...wire.state, item: { description: 'groceries' } } };
  assert.equal(verifyReceipt(r, key.publicKeyPem, { wire: edited }).reason, 'state_mismatch');
  assert.equal(verifyReceipt(r, key.publicKeyPem, { wire: { ...wire, questions: {} } }).reason, 'questions_mismatch');
  assert.equal(verifyReceipt(r, key.publicKeyPem, { wire: { ...wire, model: 'jev-latest' } }).reason, 'model_mismatch');
  assert.equal(verifyReceipt(r, key.publicKeyPem, { mandate: { id: 'm1', signature: 'other' } }).reason, 'mandate_mismatch');
});

test('receipt: stable JSON does not depend on key order', () => {
  assert.equal(stable({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }), stable({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
});

// --- Log -------------------------------------------------------------------------
test('log: every receipt has a proof that checks against the root, at every size', () => {
  for (let n = 1; n <= 17; n++) {
    const log = new ReceiptLog();
    const leaves = Array.from({ length: n }, (_, i) => `receipt-${i}`);
    leaves.forEach((l) => log.append(l));
    const root = log.root();
    leaves.forEach((l, i) => assert.equal(verifyInclusion(l, log.proof(i), root), true, `n=${n} i=${i}`));
  }
});

test('log: a receipt that was not there cannot be proved, and adding one changes the root', () => {
  const log = new ReceiptLog();
  ['a', 'b', 'c', 'd', 'e'].forEach((l) => log.append(l));
  const root = log.root();
  assert.equal(verifyInclusion('forged', log.proof(2), root), false);
  log.append('f');
  assert.notEqual(log.root(), root);
  assert.equal(verifyInclusion('c', log.proof(2), root), false, 'a proof from the new tree does not fit the old root');
  assert.throws(() => log.proof(99), /no such receipt/);
});

test('log: a proof for one receipt among a million is about twenty hashes', () => {
  const log = new ReceiptLog();
  for (let i = 0; i < 4096; i++) log.append(`r${i}`);
  assert.equal(log.proof(1234).length, 12);
});

// --- In the pipeline ---------------------------------------------------------------
test('pipeline: a model-backed decision leaves a receipt that verifies and is in the log', () => {
  const alice = createPrincipal('alice');
  const signed = issueMandate(alice, { id: 'm1', agentId: 'a1', purpose: 'the weekly household shop', categories: ['in_scope'], maxPerTxn: 500, maxTotal: 1000, expiresAt: 10 });
  const answer = { ok: true, p: { unauthorised: 0.02, outside_mandate: 0.9 }, version: PINNED_MODEL, latencyMs: 90 };
  const build = (receiptKey) => {
    const decider = new GuardedDecider({ model: { decideSync: () => answer } });
    const gateway = new Gateway({
      controls: controlsFor(['rails', 'mandate', 'storm']), registry: new Map([['alice', alice.publicKeyPem]]),
      world: { expectedChallengeCompletion: () => 0, challenge: () => false, issuerRequiresSca: () => false, issuerAuthorise: () => 'approved' },
      economics: ECONOMICS, behaviour: BEHAVIOUR, now: () => 0, decider, receiptKey,
    });
    const req = {
      intentId: 'i1', attempt: 0, isAgent: true, payerId: 'a1', mandate: signed, merchantId: 'shop', cartId: 'c', category: 'in_scope',
      itemDescription: 'prepaid Visa card', amount: 120, aggregated: false, dialect: 'core', idempotencyKey: 'k', riskScore: 0,
    };
    return { gateway, req, decider, result: gateway.handle(req) };
  };

  const g = build(key);
  assert.equal(g.result.reason, 'risk_decline', 'the receipt records refusals as well as approvals');
  const { receipt, index } = g.gateway.receipts.get('i1#0');
  const sent = g.decider.request(g.req, g.gateway.context(g.req)).wire;
  assert.deepEqual(verifyReceipt(receipt, key.publicKeyPem, { wire: sent, mandate: signed }), { ok: true });
  assert.equal(receipt.action, 'decline');
  assert.equal(verifyInclusion(receiptLeaf(receipt), g.gateway.receiptLog.proof(index), g.gateway.receiptLog.root()), true);

  assert.equal(build(null).gateway.receipts.size, 0, 'no key, no receipts');
});

// --- The rules regime --------------------------------------------------------------
test('sim: when the rules recognise receipts, the stack’s agent-dispute claims fall', () => {
  const run = (behaviour) => {
    let claims = 0;
    for (let s = 0; s < 4; s++) claims += simulate({ intents: 8000, agentShare: 0.8, seed: s, bets: ['rails', 'mandate', 'storm'], behaviour }).agentClaims;
    return claims;
  };
  assert.ok(run({ evidenceRecognised: true }) < run({}) * 0.8);
});

// --- The thesis model --------------------------------------------------------------
const world = {
  gmv: 1e12, ticket: 80, share: 0.02, receiptFee: 0.01, receiptMargin: 0.8, attach: 0.3,
  feeBps: 40, claimsBps: 12, opexShare: 0.25, multiple: 12,
};

test('thesis: value scales with share, and a loss-making guarantee is not sold', () => {
  const a = evaluateThesis(world);
  assert.ok(Math.abs(evaluateThesis({ ...world, share: 0.04 }).value / a.value - 2) < 1e-9);
  const bad = evaluateThesis({ ...world, claimsBps: 500 });
  assert.ok(bad.guaranteeProfit < 0);
  assert.equal(bad.profit, bad.receiptProfit, 'the guarantee contributes nothing, not a loss');
});

test('thesis: the required share is the share at which value equals the target', () => {
  const claims = { today: 38, recognised: 12 };
  const mode = (k) => THESIS_PRIORS[k][1];
  for (const row of requiredShare(claims)) {
    const v = evaluateThesis({
      gmv: row.gmvTrillion * 1e12, share: row.share, ticket: mode('averageTicket'), receiptFee: mode('receiptFee'),
      receiptMargin: mode('receiptMargin'), attach: mode('guaranteeAttach'), feeBps: mode('guaranteeFeeBps'),
      claimsBps: 12, opexShare: mode('guaranteeOpexShare'), multiple: mode('profitMultiple'),
    }).value;
    if (row.reachable) assert.ok(Math.abs(v / 1e9 - 1) < 1e-6);
  }
});

test('thesis: reproducible, and the billion lives in the world where rules recognise receipts', () => {
  const claims = { today: 38, recognised: 12 };
  const a = thesisMonteCarlo(claims, { draws: 4000, seed: 5 });
  const b = thesisMonteCarlo(claims, { draws: 4000, seed: 5 });
  assert.equal(a.all.mean, b.all.mean);
  assert.ok(a.recognised.p50 > a.today.p50 * 3);
  assert.ok(a.recognised.pOver1bn > a.today.pOver1bn);
  assert.ok(a.all.pOver1bn < 0.5, 'a billion is the tail, not the base case');
});
