// The guard is everything between "the model said something" and "the gateway acts
// on it". Each check exists because of a specific way a decision model fails:
//
//   deadline + fallback   F18  no usable answer in time (latency, outage, bad body)
//   version pin           F19  the moving alias now points at a different model
//   recalibration         F17  its probabilities do not match outcomes on our traffic
//   state hygiene         F20  untrusted text in the state talks it into an answer
//                              (enforced where the state is built: request.js)
//
// With the guard off, a missing answer means the payment cannot be decided and is
// declined, and whatever the model says is believed as stated.

import { buildDecisionRequest, PINNED_MODEL, MOVING_ALIAS } from './request.js';
import { fitPlatt, applyPlatt } from './calibration.js';

export const DEFAULT_GUARDS = { fallback: true, pin: true, recalibrate: true, hygiene: true };
export const NO_GUARDS = { fallback: false, pin: false, recalibrate: false, hygiene: false };

export class GuardedDecider {
  /**
   * @param {Object} o
   * @param {{decideSync?: Function, decide?: Function}} o.model
   * @param {typeof DEFAULT_GUARDS} [o.guards]
   * @param {number} [o.deadlineMs]
   * @param {number} [o.refitEvery]   Re-fit the recalibration after this many labels.
   */
  constructor({ model, guards = DEFAULT_GUARDS, deadlineMs = 400, refitEvery = 400 }) {
    this.model = model;
    this.guards = guards;
    this.deadlineMs = deadlineMs;
    this.refitEvery = refitEvery;
    this.platt = Object.fromEntries(['unauthorised', 'outside_mandate'].map((q) => [q, { a: 1, b: 0 }]));
    this.labels = { unauthorised: [], outside_mandate: [] };
    this.sinceFit = 0;
    this.stats = { asked: 0, answered: 0, fallback: 0, unavailable: 0, deadline: 0, error: 0, wrongVersion: 0 };
    this.raw = { unauthorised: [], outside_mandate: [] }; // (stated p, outcome) for reporting
  }

  request(req, ctx) {
    return buildDecisionRequest(req, ctx, {
      model: this.guards.pin ? PINNED_MODEL : MOVING_ALIAS,
      hygiene: this.guards.hygiene,
    });
  }

  // Turn a raw outcome into something the pipeline can act on.
  #resolve(outcome) {
    this.stats.asked++;
    let reason = null;
    if (!outcome.ok) reason = outcome.error === 'deadline' ? 'deadline' : 'error';
    else if (outcome.latencyMs > this.deadlineMs) reason = 'deadline';
    else if (this.guards.pin && outcome.version && outcome.version !== PINNED_MODEL) reason = 'wrongVersion';
    if (reason) {
      this.stats[reason]++;
      if (this.guards.fallback) {
        this.stats.fallback++;
        return { ok: false, fallback: 'static', reason };
      }
      this.stats.unavailable++;
      return { ok: false, fallback: null, reason };
    }
    this.stats.answered++;
    const p = { ...outcome.p };
    if (this.guards.recalibrate) for (const q of Object.keys(p)) p[q] = applyPlatt(this.platt[q], p[q]);
    return { ok: true, p, stated: outcome.p, version: outcome.version };
  }

  decideSync(req, ctx) {
    return this.#resolve(this.model.decideSync(this.request(req, ctx), this.deadlineMs));
  }

  async decide(req, ctx) {
    return this.#resolve(await this.model.decide(this.request(req, ctx), this.deadlineMs));
  }

  /**
   * Feed back what actually happened. In production these labels arrive weeks
   * later, as disputes, and only for payments that were approved (F21).
   */
  learn(stated, truth) {
    for (const q of Object.keys(stated)) {
      const pair = [stated[q], truth[q] ? 1 : 0];
      this.raw[q].push(pair);
      if (this.guards.recalibrate) this.labels[q].push(pair);
    }
    if (this.guards.recalibrate && ++this.sinceFit >= this.refitEvery) {
      this.sinceFit = 0;
      for (const q of Object.keys(this.labels)) this.platt[q] = fitPlatt(this.labels[q].slice(-4000));
    }
  }
}
