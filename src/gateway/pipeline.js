// The reference agent-payment pipeline.
//
//   protocol -> attestation -> idempotency -> mandate -> decision -> SCA -> issuer -> ledger
//
// The order is a design decision (docs/adr/0002-stage-order.md):
//   - idempotency sits after authentication, so an unauthenticated caller can never
//     read a stored result;
//   - and before the mandate check, so a replay never spends budget twice.
//
// The gateway only sees what a real gateway would see. Ground truth (who is a
// fraudster, whether a lost response actually succeeded) lives in the `world` object
// the simulator injects.

import { attest, checkScope } from './mandate.js';
import { IdempotencyStore, intentKey, fingerprint } from './idempotency.js';
import { decide } from './risk.js';
import { Ledger } from './ledger.js';

export const CORE_DIALECTS = ['core'];
export const ADAPTER_DIALECTS = ['core', 'common'];
const STATIC_RULE_THRESHOLD = 1.4;

export class Gateway {
  /**
   * @param {Object} deps
   * @param {Record<string, boolean>} deps.controls
   * @param {Map<string,string>} deps.registry   principal -> registered public key
   * @param {Object} deps.world                  issuer + payer behaviour (injected)
   * @param {Object} deps.economics
   * @param {Object} deps.behaviour
   * @param {() => number} deps.now
   * @param {import('../decision/guard.js').GuardedDecider} [deps.decider]
   * @param {boolean} [deps.unattended]
   */
  constructor({ controls, registry, world, economics, behaviour, now, decider = null, unattended = false }) {
    this.controls = controls;
    this.registry = registry;
    this.world = world;
    this.eco = economics;
    this.beh = behaviour;
    this.now = now;
    this.decider = decider;
    this.unattended = unattended;
    this.lastDecision = null;
    this.dialects = new Set(controls.protocolAdapter ? ADAPTER_DIALECTS : CORE_DIALECTS);
    this.idem = new IdempotencyStore();
    this.ledger = new Ledger();
    this.spent = new Map(); // mandate id -> authorised total
    this.attempts = new Map(); // intent key -> issuer-facing attempts
    this.late = []; // authorisations whose outcome the gateway does not yet know
    this.captures = new Map(); // intent id -> [{ paymentId, amount, fee }]
    this.issuerCalls = 0;
    // Circuit breaker: the last N issuer answers, 1 = timed out.
    this.recent = new Array(behaviour.breakerWindow).fill(0);
    this.recentAt = 0;
    this.recentSeen = 0;
    this.recentTimeouts = 0;
  }

  #observe(timedOut) {
    const i = this.recentAt % this.recent.length;
    this.recentTimeouts += (timedOut ? 1 : 0) - this.recent[i];
    this.recent[i] = timedOut ? 1 : 0;
    this.recentAt++;
    this.recentSeen = Math.min(this.recentSeen + 1, this.recent.length);
  }

  // Open when the issuer is visibly struggling. While open, no retry reaches it.
  breakerOpen() {
    return this.recentSeen >= 50 && this.recentTimeouts / this.recentSeen > this.beh.breakerThreshold;
  }

  fee(req) {
    const e = this.eco;
    const raw = req.aggregated
      ? (e.gatewayFeePct + e.aggregationPremiumPct) * req.amount + e.gatewayFeeFixed / e.aggregationBatch
      : e.gatewayFeePct * req.amount + e.gatewayFeeFixed;
    return Math.round(raw * 1000) / 1000;
  }

  // What the gateway has verified about a request, without side effects. Used to
  // build the decision request ahead of time on the async path.
  context(req) {
    const c = this.controls;
    const spent = req.mandate ? this.spent.get(req.mandate.id) ?? 0 : 0;
    return {
      attested: Boolean(req.isAgent && c.attestation && attest(req.mandate, this.registry).ok),
      mandateVerified: Boolean(req.isAgent && c.mandateVerify && checkScope(req.mandate, req, spent, this.now()).ok),
      spent,
      unattended: this.unattended,
    };
  }

  // The real Jev client is asynchronous. Ask it first, then run the same
  // synchronous pipeline with the answer in hand.
  async handleAsync(req) {
    const ask = this.controls.decisionLayer && req.isAgent && this.decider;
    return this.handle(req, ask ? await this.decider.decide(req, this.context(req)) : undefined);
  }

  handle(req, decision) {
    const c = this.controls;
    this.lastDecision = null;
    const out = (status, reason, stage, extra = {}) => ({ status, reason, stage, issuerTouched: false, ...extra });

    // 1. Protocol
    if (req.isAgent && !this.dialects.has(req.dialect)) {
      return out('rejected', 'unsupported_protocol', 'protocol');
    }

    // 2. Attestation: is this really the principal's agent?
    let attested = false;
    if (req.isAgent && c.attestation) {
      const a = attest(req.mandate, this.registry);
      if (!a.ok) return out('rejected', a.reason, 'attestation');
      attested = true;
    }

    // 3. Idempotency
    const iKey = intentKey(req);
    const key = c.intentIdempotency ? `i:${iKey}` : `c:${req.merchantId}:${req.idempotencyKey}`;
    const seen = this.idem.begin(key, fingerprint(req));
    if (seen.kind === 'replay') return { ...seen.result, replayed: true, issuerTouched: false };
    if (seen.kind === 'in_flight') return out('pending', 'in_flight', 'idempotency');
    if (seen.kind === 'conflict') return out('rejected', 'idempotency_conflict', 'idempotency');
    const finish = (result) => {
      this.idem.complete(key, result);
      return result;
    };

    // Retry budget: one clean retry per intent, and none at all while the issuer
    // is struggling. Machine-speed retries against a slow issuer are how a blip
    // becomes an outage. (The breaker was added after the model showed the budget
    // alone made a brownout worse: docs/adr/0005.)
    if (c.retryBudget) {
      const n = (this.attempts.get(iKey) ?? 0) + 1;
      this.attempts.set(iKey, n);
      if (n > 2) return finish(out('rejected', 'retry_budget_exhausted', 'retry_budget'));
      if (n > 1 && this.breakerOpen()) return finish(out('rejected', 'circuit_open', 'retry_budget'));
    }

    // 4. Mandate scope
    let mandateVerified = false;
    if (req.isAgent && c.mandateVerify) {
      const s = checkScope(req.mandate, req, this.spent.get(req.mandate.id) ?? 0, this.now());
      if (!s.ok) return finish(out('rejected', s.reason, 'mandate'));
      mandateVerified = true;
    }

    // 5. Decision. Human traffic keeps whatever risk tooling it has today; this
    //    stage only changes how automated traffic is judged.
    //    Jev estimates, expected value decides, and if Jev has nothing usable to
    //    say in time the guard falls back to the static rule the gateway runs today.
    let challenged = false;
    let staticRule = req.isAgent;
    if (c.decisionLayer && req.isAgent && this.decider) {
      const spent = req.mandate ? this.spent.get(req.mandate.id) ?? 0 : 0;
      const j = decision ?? this.decider.decideSync(req, { attested, mandateVerified, spent, unattended: this.unattended });
      this.lastDecision = j;
      if (j.ok) {
        staticRule = false;
        // Either finding makes this a payment the cardholder will not stand behind.
        const pBad = 1 - (1 - j.p.unauthorised) * (1 - j.p.outside_mandate);
        const d = decide({
          amount: req.amount,
          pFraud: pBad,
          fee: this.fee(req),
          merchantMargin: this.eco.merchantGrossMargin,
          chargebackFee: this.eco.chargebackFee,
          stepUpCompletion: this.world.expectedChallengeCompletion(req, c.delegatedSca),
          stepUpCatch: 0.9,
        });
        if (d.action === 'decline') return finish(out('declined', 'risk_decline', 'risk', { ev: d.ev, pBad }));
        if (d.action === 'step_up') {
          if (!this.world.challenge(req, c.delegatedSca)) {
            return finish(out('declined', 'risk_challenge_failed', 'risk', { ev: d.ev, pBad }));
          }
          challenged = true;
        }
      } else if (!j.fallback) {
        return finish(out('declined', 'decision_unavailable', 'risk'));
      }
    }
    if (staticRule && req.riskScore > STATIC_RULE_THRESHOLD) {
      return finish(out('declined', 'static_rule', 'risk'));
    }

    // Aggregated micro-tickets draw down a pre-authorised hold: no issuer round
    // trip, no challenge. The exposure moves to settlement (see simulate.js).
    if (req.aggregated) {
      return finish(this.#capture(req, out('approved', 'aggregated', 'ledger')));
    }

    // 6. Issuer-required authentication
    if (!challenged && this.world.issuerRequiresSca(req, c.delegatedSca)) {
      if (!this.world.challenge(req, c.delegatedSca)) {
        return finish(out('declined', 'sca_abandoned', 'sca'));
      }
    }

    // 7. Issuer authorisation
    this.issuerCalls++;
    const r = this.world.issuerAuthorise(req, attested);
    this.#observe(r === 'timeout_ok' || r === 'timeout_fail');
    if (r === 'approved') return finish(this.#capture(req, out('approved', 'approved', 'issuer', { issuerTouched: true })));
    if (r === 'declined' || r === 'false_declined') {
      return finish(out('declined', r === 'declined' ? 'issuer_decline' : 'issuer_false_decline', 'issuer', { issuerTouched: true }));
    }

    // Timeout: the response was lost. The cardholder may or may not be charged.
    const succeeded = r === 'timeout_ok';
    if (c.retryBudget) {
      // Ask the issuer what happened before answering the caller. One extra call
      // buys a definitive answer, which is what makes a retry safe.
      this.issuerCalls++;
      if (succeeded) {
        return finish(this.#capture(req, out('approved', 'resolved_by_inquiry', 'issuer', { issuerTouched: true })));
      }
      this.idem.entries.delete(key); // definitively failed: safe to run again
      return out('declined', 'timeout_definitive', 'issuer', { issuerTouched: true, retryable: true });
    }
    this.late.push({ req: { ...req }, key, succeeded }); // snapshot: the caller reuses and mutates req on retry
    // Client-key mode does not cache an error, so the same key will run again.
    if (!c.intentIdempotency) this.idem.entries.delete(key);
    return out('unknown', 'issuer_timeout', 'issuer', { issuerTouched: true });
  }

  // Late responses arrive. Anything that actually succeeded is a real charge on a
  // real card, whether or not a retry has since gone through as well.
  settleLate() {
    for (const { req, key, succeeded } of this.late) {
      const result = succeeded
        ? this.#capture(req, { status: 'approved', reason: 'late_response', stage: 'issuer', issuerTouched: false })
        : { status: 'declined', reason: 'timeout_unresolved', stage: 'issuer', issuerTouched: false };
      const entry = this.idem.entries.get(key);
      if (entry && entry.state === 'in_flight') this.idem.complete(key, result);
    }
    this.late.length = 0;
  }

  #capture(req, result) {
    const paymentId = `${req.intentId}#${req.attempt}`;
    const fee = this.fee(req);
    this.ledger.authorise(paymentId, req.amount);
    this.ledger.capture(paymentId, req.amount, fee);
    if (req.mandate) this.spent.set(req.mandate.id, (this.spent.get(req.mandate.id) ?? 0) + req.amount);
    const list = this.captures.get(req.intentId) ?? [];
    list.push({ paymentId, amount: req.amount, fee });
    this.captures.set(req.intentId, list);
    return { ...result, paymentId };
  }
}
