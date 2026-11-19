// Named experiments. Each one answers a question someone would actually ask.

import { simulate, simulateMean, registry } from './simulate.js';
import { Gateway } from '../gateway/pipeline.js';
import { issueMandate, createPrincipal } from '../gateway/mandate.js';
import { CONTROLS, BET_KEYS, SEGMENTS, ECONOMICS, BEHAVIOUR, controlsFor } from '../assumptions.js';
import { DEFAULT_GUARDS } from '../decision/guard.js';
import { measuredDials } from '../decision/measure.js';

const MEASURED = Boolean(measuredDials());

const ALL = controlsFor(BET_KEYS);
const CORE = ['rails', 'mandate', 'storm'];
export const REFERENCE = { agentShare: 0.3, ticketFactor: 0.6 };

// 1. What happens when agent traffic meets today's gateway, and what the full
//    stack changes.
export function headline({ intents = 12000, seeds = 3 } = {}) {
  const out = {};
  for (const segment of Object.keys(SEGMENTS)) {
    out[segment] = {
      human: simulateMean({ segment, agentShare: 0, intents }, seeds),
      naive: simulateMean({ segment, ...REFERENCE, intents }, seeds),
      railsOnly: simulateMean({ segment, ...REFERENCE, bets: ['rails'], intents }, seeds),
      core: simulateMean({ segment, ...REFERENCE, bets: CORE, intents }, seeds),
      full: simulateMean({ segment, ...REFERENCE, bets: BET_KEYS, intents }, seeds),
    };
  }
  return out;
}

// 2. Which single control is load-bearing? Remove one at a time from the full stack.
export function ablation({ intents = 12000, seeds = 3 } = {}) {
  const out = {};
  for (const segment of Object.keys(SEGMENTS)) {
    const full = simulateMean({ segment, ...REFERENCE, controls: ALL, intents }, seeds);
    out[segment] = Object.keys(CONTROLS).map((c) => {
      const r = simulateMean({ segment, ...REFERENCE, controls: { ...ALL, [c]: false }, intents }, seeds);
      return {
        control: c,
        netDelta: r.perIntent.gatewayNet - full.perIntent.gatewayNet,
        merchantLossDelta: r.perIntent.merchantLoss - full.perIntent.merchantLoss,
        disputeRatio: r.disputeRatio,
        duplicateRate: r.duplicateRate,
        completion: r.honestAgentCompletion,
        cliffShare: r.cliffShare,
      };
    });
    out[segment].full = {
      net: full.perIntent.gatewayNet,
      merchantLoss: full.perIntent.merchantLoss,
      disputeRatio: full.disputeRatio,
      completion: full.honestAgentCompletion,
    };
  }
  return out;
}

// 3. Issuer brownout. Raise the base timeout rate and watch what the retry loop
//    does to it. The interesting output is the shape, not any one point.
export const BROWNOUT_RATES = [0.004, 0.008, 0.015, 0.025, 0.04, 0.06];
export function brownout({ intents = 12000, seeds = 3, segment = 'online' } = {}) {
  const configs = { naive: [], railsOnly: ['rails'], core: CORE };
  const out = {};
  for (const [name, bets] of Object.entries(configs)) {
    out[name] = BROWNOUT_RATES.map((rate) => {
      const r = simulateMean({ segment, agentShare: 0.3, bets, intents, behaviour: { issuerTimeout: rate } }, seeds);
      return {
        base: rate,
        effective: r.timeoutRate,
        duplicateRate: r.duplicateRate,
        disputeRatio: r.disputeRatio,
        net: r.perIntent.gatewayNet,
        cliffShare: r.cliffShare,
      };
    });
  }
  return out;
}

// 4. The decision model under attack. Hold the recommended stack fixed and change
//    only what answers the question "is this payment one the cardholder will stand
//    behind?". Each failure is run twice: with the one guard that addresses it
//    switched off, then on.
const without = (guard) => ({ ...DEFAULT_GUARDS, [guard]: false });
export const DECISION_VARIANTS = [
  { key: 'static', label: 'Static rule (no decision model)', group: 'baseline', run: { controls: { ...controlsFor(CORE), decisionLayer: false, decisionGuards: false } } },
  { key: 'jev', label: MEASURED ? 'Jev as measured, guarded' : 'Jev as assumed, guarded', group: 'baseline', run: {} },
  // With a real measurement the pair is the real thing: Jev's stated probabilities,
  // used raw and then recalibrated. Without one it is a hypothetical overconfident model.
  ...(MEASURED
    ? [
        { key: 'miscal_raw', label: 'Jev\u2019s probabilities believed as stated', group: 'F17 Miscalibration', run: { decision: { guards: without('recalibrate') } } },
        { key: 'miscal_guarded', label: 'Recalibrated against outcomes', group: 'F17 Miscalibration', run: {} },
      ]
    : [
        { key: 'miscal_raw', label: 'Overconfident, believed as stated', group: 'F17 Miscalibration', run: { decision: { model: { slope: 2 }, guards: without('recalibrate') } } },
        { key: 'miscal_guarded', label: 'Overconfident, recalibrated', group: 'F17 Miscalibration', run: { decision: { model: { slope: 2 } } } },
      ]),
  { key: 'outage_raw', label: 'One call in five fails, no fallback', group: 'F18 No answer in time', run: { decision: { model: { outage: 0.2 }, guards: without('fallback') } } },
  { key: 'outage_guarded', label: 'One call in five fails, fallback to static rule', group: 'F18 No answer in time', run: { decision: { model: { outage: 0.2 } } } },
  { key: 'drift_raw', label: 'Alias moves to a weaker model', group: 'F19 Version drift', run: { decision: { model: { driftAt: 0.3 }, guards: without('pin') } } },
  { key: 'drift_guarded', label: 'Version pinned', group: 'F19 Version drift', run: { decision: { model: { driftAt: 0.3 } } } },
  { key: 'inject_raw', label: 'Planted text reaches the model', group: 'F20 State injection', run: { behaviour: { injectionAttempt: 0.8 }, decision: { guards: without('hygiene') } } },
  { key: 'inject_guarded', label: 'Untrusted text kept out of the state', group: 'F20 State injection', run: { behaviour: { injectionAttempt: 0.8 } } },
];

function bothSegments(run, { intents, seeds }) {
  const rs = Object.keys(SEGMENTS).map((segment) => simulateMean({ segment, ...REFERENCE, bets: CORE, intents, ...run }, seeds));
  const mean = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  return {
    net: mean((r) => r.perIntent.gatewayNet) * 1000,
    merchantLoss: mean((r) => r.perIntent.merchantLoss) * 1000,
    completion: mean((r) => r.honestAgentCompletion),
    disputeRatio: mean((r) => r.disputeRatio),
    fallbackShare: mean((r) => r.decision.fallbackShare),
    unavailableShare: mean((r) => r.decision.unavailableShare),
    ece: mean((r) => r.decision.ece),
  };
}

export function decisionExperiment({ intents = 24000, seeds = 6 } = {}) {
  return DECISION_VARIANTS.map((v) => ({ key: v.key, label: v.label, group: v.group, ...bothSegments(v.run, { intents, seeds }) }));
}

// 5. How good does the decision model have to be? Sweep its skill and compare with
//    the static rule. Separation 1.6 is roughly AUC 0.87; 2.2 is 0.94; 3.0 is 0.98.
export const SKILL_GRID = [0.6, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0];
export function skillSweep({ intents = 24000, seeds = 6 } = {}) {
  return SKILL_GRID.map((separation) => ({
    separation,
    ...bothSegments({ decision: { model: { separation } } }, { intents, seeds }),
  }));
}

// 6. Could agent-payment disputes be underwritten? Claims are merchant losses from
//    disputes about authorisation or scope, in basis points of agent volume. A
//    guarantee is only a business if that number is small and stable.
export function guarantee({ intents = 24000, seeds = 6 } = {}) {
  const configs = [
    { key: 'naive', label: 'Today’s gateway', run: { bets: [] } },
    { key: 'railsOnly', label: 'Rails only', run: { bets: ['rails'] } },
    { key: 'core', label: 'Full stack, today’s rules', run: { bets: CORE } },
    { key: 'recognised', label: 'Full stack, receipts recognised', run: { bets: CORE, behaviour: { evidenceRecognised: true } } },
  ];
  return configs.map(({ key, label, run }) => {
    const rs = Object.keys(SEGMENTS).map((segment) => simulateMean({ segment, ...REFERENCE, intents, ...run }, seeds));
    const claims = rs.reduce((a, r) => a + r.agentClaims, 0);
    const volume = rs.reduce((a, r) => a + r.agentGdv, 0);
    return { key, label, claimsBps: volume ? (claims / volume) * 1e4 : 0 };
  });
}

// 7. One payment, traced. A scripted issuer loses the first response (the charge
//    went through) and answers the second. Same agent, same behaviour, two gateways.
export function trace() {
  const principal = createPrincipal('principal-trace');
  const mandate = issueMandate(principal, {
    id: 'mandate-trace',
    agentId: 'agent-trace',
    categories: ['in_scope'],
    maxPerTxn: 200,
    maxTotal: 500,
    expiresAt: 1e9,
  });
  const run = (label, bets) => {
    const script = ['timeout_ok', 'approved', 'approved', 'approved'];
    const world = {
      expectedChallengeCompletion: () => 1,
      challenge: () => true,
      issuerRequiresSca: () => false,
      issuerAuthorise: () => script.shift(),
    };
    const gateway = new Gateway({
      controls: { ...controlsFor(bets), protocolAdapter: true },
      registry: new Map([[principal.name, principal.publicKeyPem]]),
      world,
      economics: ECONOMICS,
      behaviour: BEHAVIOUR,
      now: () => 0,
    });
    const req = {
      intentId: 'charge-ev-session', attempt: 0, isAgent: true, payerId: 'agent-trace', mandate,
      merchantId: 'charger-17', cartId: 'session-8841', category: 'in_scope', amount: 23.4,
      aggregated: false, dialect: 'core', idempotencyKey: 'key-a', riskScore: 0,
    };
    const steps = [];
    let res = gateway.handle(req);
    steps.push({ attempt: 1, key: req.idempotencyKey, ...res });
    // The agent got no answer. It does what agents do: tries again, new key.
    for (let i = 0; i < 2 && res.status !== 'approved' && res.status !== 'pending'; i++) {
      req.attempt++;
      req.idempotencyKey = `key-${'bcd'[i]}`;
      res = gateway.handle(req);
      steps.push({ attempt: req.attempt + 1, key: req.idempotencyKey, ...res });
    }
    gateway.settleLate();
    gateway.ledger.assertInvariants();
    const charges = (gateway.captures.get(req.intentId) ?? []).length;
    return { label, steps, charges, issuerCalls: gateway.issuerCalls };
  };
  return [run('Today’s gateway', []), run('With storm-proofing', ['storm'])];
}

export { simulate, registry };
