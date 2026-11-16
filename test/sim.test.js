import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/sim/simulate.js';
import { BET_KEYS, CONTROLS, BETS } from '../src/assumptions.js';
import { FAILURE_MODES } from '../src/sim/failure-modes.js';
import { DEFAULT_GUARDS } from '../src/decision/guard.js';

const small = { intents: 4000, agentShare: 0.3 };

test('sim: same seed, same world', () => {
  const a = simulate({ ...small, seed: 5 });
  const b = simulate({ ...small, seed: 5 });
  assert.deepEqual(a.counts, b.counts);
  assert.equal(a.gatewayNet, b.gatewayNet);
  assert.notEqual(a.gatewayNet, simulate({ ...small, seed: 6 }).gatewayNet);
});

test('sim: the ledger balances in every configuration, including under brownout', () => {
  // simulate() asserts ledger invariants before returning; a throw fails this test.
  for (const segment of ['online', 'unattended']) {
    for (const bets of [[], ['rails'], ['storm'], BET_KEYS]) {
      simulate({ ...small, segment, bets, ticketFactor: 0.4, behaviour: { issuerTimeout: 0.05 } });
    }
  }
});

test('sim: with no agents, the agent-specific bets change nothing; storm-proofing still helps', () => {
  const base = { intents: 6000, agentShare: 0, behaviour: { issuerTimeout: 0.03 } };
  const none = simulate({ ...base, bets: [] });
  const agentOnly = simulate({ ...base, bets: ['rails', 'mandate', 'micro'] });
  assert.equal(none.revenue, agentOnly.revenue);
  assert.equal(none.counts.disputes, agentOnly.counts.disputes);
  const storm = simulate({ ...base, bets: ['storm'] });
  assert.ok(none.counts.duplicates > 0, 'humans retry too');
  assert.equal(storm.counts.duplicates, 0);
});

test('sim: storm-proofing removes duplicate charges', () => {
  const naive = simulate({ ...small, intents: 8000, behaviour: { issuerTimeout: 0.03 } });
  const hardened = simulate({ ...small, intents: 8000, bets: ['storm'], behaviour: { issuerTimeout: 0.03 } });
  assert.ok(naive.counts.duplicates > 20, 'the failure exists to begin with');
  assert.equal(hardened.counts.duplicates, 0);
});

test('sim: retries feed back into the timeout rate', () => {
  const calm = simulate({ ...small, intents: 8000, behaviour: { issuerTimeout: 0.03, stormGain: 0 } });
  const coupled = simulate({ ...small, intents: 8000, behaviour: { issuerTimeout: 0.03 } });
  assert.ok(coupled.timeoutRate > calm.timeoutRate * 1.2);
});

test('sim: rails lift honest agent completion; the mandate layer cuts merchant losses', () => {
  const naive = simulate({ ...small, intents: 8000 });
  const rails = simulate({ ...small, intents: 8000, bets: ['rails'] });
  const both = simulate({ ...small, intents: 8000, bets: ['rails', 'mandate'] });
  assert.ok(rails.honestAgentCompletion > naive.honestAgentCompletion + 0.3);
  assert.ok(both.merchantLossRate < rails.merchantLossRate);
});

test('sim: evidence is worthless without verification', () => {
  const on = { ...Object.fromEntries(Object.keys(CONTROLS).map((k) => [k, true])) };
  const run = (controls) => {
    let lost = 0;
    for (let s = 0; s < 4; s++) lost += simulate({ intents: 8000, agentShare: 0.8, seed: s, controls }).modes.friendly_fraud.merchant;
    return lost;
  };
  assert.ok(run(on) < run({ ...on, mandateVerify: false }));
});

test('register: every mitigation names a real control, every edge a real mode', () => {
  const owned = new Set(Object.values(BETS).flatMap((b) => b.controls));
  assert.deepEqual([...owned].sort(), Object.keys(CONTROLS).sort(), 'every control belongs to exactly one bet');
  for (const m of Object.values(FAILURE_MODES)) {
    for (const c of m.mitigatedBy) assert.ok(c in CONTROLS, `${m.id} names unknown control ${c}`);
    for (const f of m.feeds) assert.ok(f in FAILURE_MODES, `${m.id} feeds unknown mode ${f}`);
    if (m.introducedBy) assert.ok(m.introducedBy in CONTROLS);
  }
});

// --- The decision model inside the simulator ------------------------------------
test('sim: a skilled decision model cuts drift losses that rules cannot see', () => {
  const run = (decision) => {
    let lost = 0;
    for (let s = 0; s < 3; s++) {
      lost += simulate({ intents: 8000, agentShare: 0.8, seed: s, bets: ['rails', 'mandate', 'storm'], decision }).modes.mandate_drift.merchant;
    }
    return lost;
  };
  assert.ok(run({ model: { separation: 3.5 } }) < run({ model: { separation: 0.3 } }) * 0.7);
});

test('sim: an outage with no fallback loses honest sales; the fallback keeps them', () => {
  const base = { intents: 6000, agentShare: 0.5, bets: ['rails', 'mandate', 'storm'] };
  const bare = simulate({ ...base, decision: { model: { outage: 0.3 }, guards: { ...DEFAULT_GUARDS, fallback: false } } });
  const guarded = simulate({ ...base, decision: { model: { outage: 0.3 } } });
  assert.ok(bare.decision.unavailable > 0 && guarded.decision.unavailable === 0);
  assert.ok(guarded.honestAgentCompletion > bare.honestAgentCompletion + 0.15);
});
