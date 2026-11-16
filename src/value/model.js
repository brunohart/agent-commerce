// The valuation: expected value with a Jevons volume term.
//
// (Jev, the decision model inside the pipeline, lives in src/decision. This file
// answers a different question: which capabilities are worth building.)
//
// Plain expected value asks: across the worlds I think are possible, what is this
// bet worth on average? That is the right question and the wrong volume. It prices
// agentic commerce as today's transactions with a different payer.
//
// The Jevons adjustment says: when the cost of using something falls, more of it
// gets used. An agent collapses the cost of making a purchase (attention, time, the
// walk to the kiosk), so the number of purchases rises and the size of each one
// falls. Both effects change which failure modes bite:
//
//   count  = baseline * frictionRatio ^ -elasticity          (more transactions)
//   ticket = baseline * (count multiplier) ^ -fragmentation   (smaller ones)
//
//   value(bet) = E[ sum_t  intents_t * net_per_intent(bets, agent share_t, ticket)
//                        * retention_t / (1+r)^t ]  -  build  -  run
//
// net_per_intent is not assumed. It comes from the simulator: fee revenue minus
// every failure mode's cost, for that set of controls, at that mix and ticket size.
// The number reported is the difference from doing nothing in the same world.

import {
  PRIORS, BETS, BET_KEYS, SEGMENTS, HORIZON_YEARS, BASELINE_TXNS, JEVONS_CAP,
} from '../assumptions.js';
import { createRng, triangularQuantile, quantile } from '../rng.js';
import { interpolate, allPortfolios, portfolioKey } from './surface.js';

const SEG_KEYS = Object.keys(SEGMENTS);

// Flatten every prior into a named triangular input.
export function priorList() {
  const out = [];
  for (const name of ['agentShare', 'frictionRatio', 'elasticity', 'fragmentation']) {
    for (const seg of SEG_KEYS) out.push({ key: `${name}.${seg}`, tri: PRIORS[name][seg] });
  }
  for (const name of ['erosion', 'churnSensitivity', 'discountRate', 'rampMidpointYear']) {
    out.push({ key: name, tri: PRIORS[name] });
  }
  for (const b of BET_KEYS) {
    out.push({ key: `buildCost.${b}`, tri: BETS[b].buildCost });
    out.push({ key: `runCost.${b}`, tri: BETS[b].runCost });
  }
  return out;
}
const PRIOR_LIST = priorList();

export function sampleInputs(rng) {
  const x = {};
  for (const { key, tri } of PRIOR_LIST) x[key] = rng.triangular(...tri);
  return x;
}

export function inputsAtQuantile(q, overrides = {}) {
  const x = {};
  for (const { key, tri } of PRIOR_LIST) x[key] = triangularQuantile(q, ...tri);
  return { ...x, ...overrides };
}

export const jevonsMultiplier = (frictionRatio, elasticity) =>
  Math.min(JEVONS_CAP, Math.pow(frictionRatio, -elasticity));

const logistic = (z) => 1 / (1 + Math.exp(-z));
const ramp = (t, mid) => logistic((t - mid) / 0.8) / logistic((HORIZON_YEARS - mid) / 0.8);

/**
 * Value of a portfolio of bets in one world. NZ$m, per BASELINE_TXNS baseline
 * transactions a year in each segment.
 */
export function evaluate(x, bets, surface, { jevons = true, key = portfolioKey(bets) } = {}) {
  const hasRails = bets.includes('rails');
  const r = x.discountRate;
  const bySegment = {};
  let operating = 0;

  for (const seg of SEG_KEYS) {
    const cell = surface[seg][key];
    const baseMlr = cell.mlr[0][0];
    const J = jevons ? jevonsMultiplier(x[`frictionRatio.${seg}`], x[`elasticity.${seg}`]) : 1;
    const ticket = Math.pow(J, -x[`fragmentation.${seg}`]);
    let pv = 0;
    for (let t = 1; t <= HORIZON_YEARS; t++) {
      const a = x[`agentShare.${seg}`] * ramp(t, x.rampMidpointYear);
      const agentIntents = BASELINE_TXNS * a * J;
      const intents = agentIntents + BASELINE_TXNS * (1 - a);
      const share = agentIntents / intents;
      const net = interpolate(cell.net, share, ticket);
      const mlr = interpolate(cell.mlr, share, ticket);
      // Not agent-ready: merchants with agent-shopping customers move the account.
      const erosion = hasRails ? 1 : Math.max(0, 1 - x.erosion * a);
      // Merchants leave a processor that costs them money they did not expect to lose.
      const churn = 1 - Math.min(0.6, x.churnSensitivity * Math.max(0, mlr - baseMlr));
      pv += (intents * net * erosion * churn) / Math.pow(1 + r, t);
    }
    bySegment[seg] = pv / 1e6;
    operating += pv / 1e6;
  }

  let build = 0;
  let run = 0;
  for (const b of bets) {
    build += x[`buildCost.${b}`];
    for (let t = 1; t <= HORIZON_YEARS; t++) run += x[`runCost.${b}`] / Math.pow(1 + r, t);
  }
  return { total: operating - build - run, operating, build, run, bySegment };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    mean,
    p05: quantile(s, 0.05),
    p25: quantile(s, 0.25),
    p50: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p95: quantile(s, 0.95),
    pLoss: s.filter((v) => v < 0).length / s.length,
  };
};

/**
 * Monte Carlo over the priors. Every portfolio is evaluated in the same world on
 * each draw (common random numbers), so differences between portfolios are
 * differences between decisions and not between dice.
 */
export function monteCarlo(surface, { draws = 4000, seed = 11 } = {}) {
  const rng = createRng(seed);
  const portfolios = allPortfolios();
  const delta = portfolios.map(() => []);
  const deltaPlain = portfolios.map(() => []);
  const segDelta = portfolios.map(() => Object.fromEntries(SEG_KEYS.map((s) => [s, 0])));
  const best = portfolios.map(() => 0);
  const baseline = [];

  for (let d = 0; d < draws; d++) {
    const x = sampleInputs(rng);
    const none = evaluate(x, [], surface);
    const nonePlain = evaluate(x, [], surface, { jevons: false });
    baseline.push(none.total);
    let top = -Infinity;
    let topIndex = 0;
    portfolios.forEach((bets, i) => {
      const v = bets.length ? evaluate(x, bets, surface) : none;
      const vPlain = bets.length ? evaluate(x, bets, surface, { jevons: false }) : nonePlain;
      delta[i].push(v.total - none.total);
      deltaPlain[i].push(vPlain.total - nonePlain.total);
      for (const s of SEG_KEYS) segDelta[i][s] += (v.bySegment[s] - none.bySegment[s]) / draws;
      if (v.total > top) {
        top = v.total;
        topIndex = i;
      }
    });
    best[topIndex]++;
  }

  return {
    draws,
    baseline: stats(baseline),
    portfolios: portfolios.map((bets, i) => ({
      key: portfolioKey(bets),
      bets,
      ...stats(delta[i]),
      plainMean: stats(deltaPlain[i]).mean, // same decision, Jevons term switched off
      pBest: best[i] / draws,
      operatingBySegment: segDelta[i],
    })),
  };
}

// Value of one variant of a portfolio against another, in the same worlds. Used to
// ask what the decision model is worth, and how good it has to be.
export function compareVariants(surface, bets, names, baseline, { draws = 2000, seed = 11 } = {}) {
  const rng = createRng(seed);
  const delta = Object.fromEntries(names.map((n) => [n, []]));
  for (let d = 0; d < draws; d++) {
    const x = sampleInputs(rng);
    const base = evaluate(x, bets, surface, { key: baseline }).total;
    for (const n of names) delta[n].push(evaluate(x, bets, surface, { key: n }).total - base);
  }
  return Object.fromEntries(names.map((n) => [n, stats(delta[n])]));
}

// Build order. At each step add the bet with the largest marginal expected value
// given what is already built. Marginal, because the bets are not independent:
// what one is worth depends on which others exist.
export function sequence(mc) {
  const byKey = Object.fromEntries(mc.portfolios.map((p) => [p.key, p]));
  const built = [];
  const steps = [];
  let current = 0;
  while (built.length < BET_KEYS.length) {
    let pick = null;
    for (const b of BET_KEYS) {
      if (built.includes(b)) continue;
      const p = byKey[portfolioKey([...built, b])];
      if (!pick || p.mean > pick.p.mean) pick = { b, p };
    }
    steps.push({ bet: pick.b, portfolio: pick.p.key, marginal: pick.p.mean - current, cumulative: pick.p.mean, pLoss: pick.p.pLoss });
    current = pick.p.mean;
    built.push(pick.b);
  }
  return steps;
}

// Interaction between two bets: value together minus the sum of value apart.
// Positive = complements (build both), negative = substitutes.
export function interactions(mc) {
  const byKey = Object.fromEntries(mc.portfolios.map((p) => [p.key, p.mean]));
  const out = [];
  for (let i = 0; i < BET_KEYS.length; i++) {
    for (let j = i + 1; j < BET_KEYS.length; j++) {
      const a = BET_KEYS[i];
      const b = BET_KEYS[j];
      out.push({ a, b, synergy: byKey[portfolioKey([a, b])] - byKey[a] - byKey[b] });
    }
  }
  return out;
}

// One-at-a-time sensitivity: move each prior from its p10 to its p90, hold the rest
// at their medians, and see how far the decision number moves. This is the list of
// things worth finding out before spending the money.
export function sensitivity(surface, bets) {
  const at = (x) => evaluate(x, bets, surface).total - evaluate(x, [], surface).total;
  const base = at(inputsAtQuantile(0.5));
  const rows = PRIOR_LIST.map(({ key, tri }) => {
    const lo = at(inputsAtQuantile(0.5, { [key]: triangularQuantile(0.1, ...tri) }));
    const hi = at(inputsAtQuantile(0.5, { [key]: triangularQuantile(0.9, ...tri) }));
    return { key, lo, hi, swing: Math.abs(hi - lo), p10: triangularQuantile(0.1, ...tri), p90: triangularQuantile(0.9, ...tri) };
  })
    .filter((r) => r.swing > 1e-9)
    .sort((a, b) => b.swing - a.swing);
  return { base, rows };
}

// Break-even: the value of one prior at which portfolio A becomes worth more than
// portfolio B, everything else at its median. Turns "it depends" into a trigger.
export function breakeven(surface, betsA, betsB, key, steps = 60) {
  const { tri } = PRIOR_LIST.find((p) => p.key === key);
  const gap = (v) => {
    const x = inputsAtQuantile(0.5, { [key]: v });
    return evaluate(x, betsA, surface).total - evaluate(x, betsB, surface).total;
  };
  let prev = gap(tri[0]);
  const curve = [{ value: tri[0], gap: prev }];
  let value = prev >= 0 ? tri[0] : null;
  for (let i = 1; i <= steps; i++) {
    const v = tri[0] + ((tri[2] - tri[0]) * i) / steps;
    const g = gap(v);
    curve.push({ value: v, gap: g });
    if (value === null && prev < 0 && g >= 0) {
      const v0 = tri[0] + ((tri[2] - tri[0]) * (i - 1)) / steps;
      value = v0 + ((v - v0) * -prev) / (g - prev);
    }
    prev = g;
  }
  return { key, value, mode: tri[1], range: [tri[0], tri[2]], curve };
}
