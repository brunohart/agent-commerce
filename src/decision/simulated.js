// A stand-in for Jev, for the simulator and the tests.
//
// It is not Jev and makes no claim about how good Jev is on payments. Nobody
// outside TypeSafe and its early-access customers knows that yet, and the only
// honest way to find out is to run labelled traffic through it. What this gives
// instead is a decision model whose every property is a dial:
//
//   separation   how well it tells bad payments from good (1.6 ~ AUC 0.87,
//                2.2 ~ AUC 0.94, 3.0 ~ AUC 0.98)
//   slope        calibration. 1 = its probabilities are right. 2 = overconfident:
//                it says 1% when the truth is nearer 9%.
//   latency      lognormal, against the gateway's deadline
//   outage       share of calls that return nothing
//   drift        the moving alias switches to a weaker version part-way through
//   injection    untrusted text in the state lowers its estimate
//
// The decision experiment turns each dial and measures what it costs.

import { posterior } from '../gateway/risk.js';
import { logit, sigmoid } from './calibration.js';
import { PINNED_MODEL, MOVING_ALIAS } from './request.js';

export const JEV_PRIORS = {
  separation: 2.2,
  slope: 1,
  latencyMedianMs: 180, // vendor-reported range is 70 to 500 ms
  latencySigma: 0.45,
  outage: 0.002,
  driftAt: null, // fraction of the run after which jev-latest changes
  driftSeparation: 0.8,
  injectionEffect: 0.08, // multiplier on stated probability when injection lands
  injectionSuccess: 0.6,
};

export class SimulatedJev {
  /**
   * @param {Object} o
   * @param {Object} o.rng
   * @param {(ref: string) => {unauthorised: boolean, outside_mandate: boolean, injects: boolean}} o.truth
   * @param {(context: object) => {unauthorised: number, outside_mandate: number}} o.baseRates
   * @param {() => number} o.progress   0..1 through the run, for drift.
   */
  constructor({ rng, truth, baseRates, progress, ...dials }) {
    this.rng = rng;
    this.truth = truth;
    this.baseRates = baseRates;
    this.progress = progress;
    this.d = { ...JEV_PRIORS, ...dials };
  }

  decideSync(request) {
    const d = this.d;
    const latencyMs = this.rng.lognormal(d.latencyMedianMs, d.latencySigma);
    if (this.rng.bool(d.outage)) return { ok: false, error: 'http_529', latencyMs };

    // Which model actually answers? A pinned request always gets the pinned model.
    const drifted = request.wire.model === MOVING_ALIAS && d.driftAt !== null && this.progress() >= d.driftAt;
    const separation = drifted ? d.driftSeparation : d.separation;
    const version = drifted ? 'jev-1.14' : PINNED_MODEL;

    const t = this.truth(request.ref);
    const base = this.baseRates(request.context);
    const p = {};
    for (const q of ['unauthorised', 'outside_mandate']) {
      const evidence = this.rng.normal() + (t[q] ? separation : 0);
      const calibrated = posterior(base[q], evidence, separation);
      let stated = sigmoid(d.slope * logit(calibrated));
      // Injection only exists if untrusted text reached the state.
      if (t[q] && t.injects && request.wire.state.agent.note && this.rng.bool(d.injectionSuccess)) {
        stated *= d.injectionEffect;
      }
      p[q] = stated;
    }
    return { ok: true, p, version, latencyMs };
  }
}
