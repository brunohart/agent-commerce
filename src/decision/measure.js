// Measure the real Jev and turn what it does into the dials the simulator uses.
//
// Until this has been run, every simulation uses the priors in simulated.js. After
// it, docs/jev-measured.json exists and the simulator uses Jev's measured skill,
// calibration, latency and error rate instead. The stand-in stops being a guess
// and becomes a statistical replay of the real model.
//
//   TYPESAFE_API_KEY=... node src/cli.js measure

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDecisionRequest, PINNED_MODEL } from './request.js';
import { ece, brier, fitPlatt } from './calibration.js';
import { quantile } from '../rng.js';

export const MEASURED_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'jev-measured.json');

// Area under the ROC curve: the chance a random bad case is scored above a random
// good one. Ties count half.
export function auc(pairs) {
  const pos = pairs.filter(([, y]) => y === 1).map(([p]) => p);
  const neg = pairs.filter(([, y]) => y === 0).map(([p]) => p);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// Separation d between two unit normals that gives this AUC: AUC = Phi(d / sqrt 2).
export function separationFromAuc(a) {
  const target = Math.min(0.9995, Math.max(0.5, a));
  const cdf = (d) => {
    const z = d / 2;
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return 0.5 * (1 + erf);
  };
  let lo = 0;
  let hi = 6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Run every labelled case through the model and summarise.
 * @param {Object} o
 * @param {{decide: Function}} o.client   JevClient, or anything with the same interface.
 * @param {Array} o.cases                 From labelledCases().
 * @param {number} [o.deadlineMs]         Generous here: we want to see the real latency.
 * @param {number} [o.concurrency]
 * @param {number} [o.gatewayDeadlineMs]  The deadline the gateway would actually apply.
 */
export async function measure({ client, cases, deadlineMs = 5000, concurrency = 4, gatewayDeadlineMs = 400, model = PINNED_MODEL }) {
  const pairs = [];
  const rows = [];
  const latencies = [];
  const errors = {};
  const versions = {};
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++];
      const out = await client.decide(buildDecisionRequest(c.req, c.ctx, { model }), deadlineMs);
      if (!out.ok) {
        errors[out.error] = (errors[out.error] ?? 0) + 1;
        continue;
      }
      pairs.push([out.p.outside_mandate, c.outside ? 1 : 0]);
      rows.push({ id: c.id, tier: c.tier, purpose: c.purpose, item: c.item, amount: c.req.amount, outside: c.outside, jev: out.p.outside_mandate, unauthorised: out.p.unauthorised });
      latencies.push(out.latencyMs);
      versions[out.version ?? 'unknown'] = (versions[out.version ?? 'unknown'] ?? 0) + 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

  const answered = pairs.length;
  const failed = cases.length - answered;
  if (answered < 20) {
    return { ok: false, asked: cases.length, answered, errors, reason: 'too few answers to measure anything' };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const logs = latencies.map((l) => Math.log(Math.max(1, l)));
  const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sigma = Math.sqrt(logs.reduce((s, l) => s + (l - meanLog) ** 2, 0) / logs.length);
  const a = auc(pairs);
  const tierPairs = (tier) => rows.filter((r) => r.tier === tier).map((r) => [r.jev, r.outside ? 1 : 0]);
  const byTier = Object.fromEntries(
    [...new Set(rows.map((r) => r.tier))].map((tier) => {
      const tp = tierPairs(tier);
      return [tier, { n: tp.length, auc: auc(tp), brier: brier(tp), ece: ece(tp, 5) }];
    }),
  );
  // Calibration can only be fitted if the two classes overlap. If every bad case
  // scores above every good one, the fit runs away and means nothing.
  const maxGood = Math.max(...pairs.filter(([, y]) => y === 0).map(([p]) => p));
  const minBad = Math.min(...pairs.filter(([, y]) => y === 1).map(([p]) => p));
  const identifiable = maxGood > minBad;
  const platt = identifiable ? fitPlatt(pairs) : { a: null, b: null };
  // Skill is taken from the borderline tier where there is one. The clear tier only
  // shows that the task is possible; a perfect score there means the cases were too
  // easy, not that the model is perfect.
  const skillAuc = byTier.hard?.n >= 20 ? byTier.hard.auc : a;
  const atCeiling = skillAuc >= 0.999;
  const dials = {
    separation: atCeiling ? 3.0 : Math.min(3.5, separationFromAuc(skillAuc)),
    latencyMedianMs: quantile(sorted, 0.5),
    latencySigma: Math.max(0.05, sigma),
    // The measured tail is heavier than a lognormal fit, so carry it across as is.
    slowShare: latencies.filter((l) => l > gatewayDeadlineMs).length / answered,
    outage: failed / cases.length,
  };
  // Platt slope a < 1 means overconfident by a factor of 1 / a; a > 1, underconfident.
  if (identifiable && platt.a > 0) dials.slope = Math.min(4, Math.max(0.25, 1 / platt.a));
  return {
    ok: true,
    asked: cases.length,
    answered,
    errors,
    versions,
    quality: { auc: a, skillAuc, atCeiling, brier: brier(pairs), ece: ece(pairs), calibrationIdentifiable: identifiable, plattSlope: platt.a, plattBias: platt.b },
    byTier,
    cases: rows.sort((x, y) => (x.id < y.id ? -1 : 1)),
    latency: {
      medianMs: quantile(sorted, 0.5),
      p95Ms: quantile(sorted, 0.95),
      withinGatewayDeadline: latencies.filter((l) => l <= gatewayDeadlineMs).length / answered,
    },
    // What the simulator should use in place of its priors.
    dials,
  };
}

export function saveMeasured(result, path = MEASURED_PATH) {
  writeFileSync(path, `${JSON.stringify(result, null, 1)}\n`);
}

// Dials measured from the real model, or null if it has not been measured yet.
export function measuredDials(path = MEASURED_PATH) {
  if (!existsSync(path)) return null;
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'));
    return m.ok ? m.dials : null;
  } catch {
    return null;
  }
}
