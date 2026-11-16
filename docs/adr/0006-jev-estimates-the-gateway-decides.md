# 0006. Jev estimates, the gateway decides

**Status:** accepted

## Context

Most of an agent payment is checkable. One part is a judgement: whether this purchase is what the human meant. Half of mandate drift in this model keeps a matching merchant category (a gift card bought at the supermarket under a mandate for the weekly shop), so no rule sees it.

Jev (TypeSafe AI) is a decision model: state and typed questions in, an answer to each with a probability out, in a few hundred milliseconds, with no generated text. That fits the latency budget and the shape of the question.

There were three ways to use it.

1. **Ask it for the action.** A `choice` question: approve, challenge or decline.
2. **Ask it for a probability and decide ourselves.**
3. **Ask it everything**, including whether the mandate's budget is exceeded.

## Decision

Option 2, with a hard boundary around it.

- **Jev estimates.** Two `noul` (yes/no with probability) questions per agent payment: is it unauthorised, and does the item fall outside the mandate.
- **The gateway decides.** `src/gateway/risk.js` computes the expected value of approving, challenging and declining and picks the largest.
- **Rules stay rules.** Signature, cap, budget, expiry, idempotency and the ledger are deterministic and run before the model is asked. Nothing the model says can override them.
- **Only gateway-derived facts go in the state.** Text written by the agent or the merchant is left out.
- **Every answer passes a guard** before it is acted on: deadline with fallback to the static rule, pinned version, recalibration, strict parsing.

## Why not ask for the action

The right action depends on the ticket, the merchant's margin, the chargeback fee and whether anyone can answer a challenge. Those are the gateway's numbers. They differ by merchant and change over time. If the model returned the action, every one of those changes would be a prompt change, invisible in review and untestable. With a probability, a pricing change is a one-line change to a function with unit tests.

It also makes the model's contribution measurable. A probability can be scored against outcomes (`src/decision/calibration.js`). An action cannot be separated from the costs it assumed.

## Consequences

- The decision is explainable in the gateway's own terms: the three expected values are returned with every result.
- Miscalibration becomes the failure that matters, because the probability is used as a number. Measured, Jev is underconfident by a factor of about 2.2 on the log-odds scale. Used as stated, its probabilities complete 78% of honest agent payments, the same as the static rule. Recalibrated, 83%.
- The decision layer's value is modest and specific: about +$0.8m against the static rule at Jev's measured skill, from more honest agent payments completed and lower merchant losses. A weak model (AUC 0.76) would be worth −$0.5m.
- Without a fallback the decision layer is a liability: −$2.1m under a one-in-five outage. The fallback is not optional.
- The async path asks Jev before running the synchronous pipeline, so a payment rejected by an earlier rule still costs one model call. At launch pricing that is negligible; it would need revisiting if pricing changed.
- Recalibration here is fed every outcome immediately. In production, labels arrive weeks late and only for approved payments (F21). That needs a holdout of payments approved regardless of the model's answer, which this repo does not implement.

## What was measured, and what was not

`node src/cli.js measure` sent 234 labelled payments to `jev-1.14.0`: AUC 0.966 on 72 borderline cases, 1.000 on 162 clear-cut ones, median latency 108 ms, 98.3% inside the 400 ms deadline, every call answered. The simulator replays those measurements (`docs/jev-measured.json`) in place of its priors.

The first client in this repo was written from third-party tutorials and had two bugs that only the primary reference revealed: the question field is `instructions`, and model ids are full versions, so a pin on `jev-1.13` would have rejected every real answer. Reading the reference came before the key, and it should have come before the client.

Not measured: performance on a gateway's real disputes, the `unauthorised` question (every test payment was authorised), and latency from a gateway's own network.
