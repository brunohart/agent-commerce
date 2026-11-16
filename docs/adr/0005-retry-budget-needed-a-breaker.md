# 0005. The retry budget needed a circuit breaker

**Status:** accepted. Supersedes the first design of the `retryBudget` control.

## Context

Agents retry immediately and several times. Against an issuer that is already slow, that is how a blip becomes an outage. The first design of the control was:

1. On a timeout, ask the issuer what happened before answering the caller.
2. If the payment definitively failed, allow **one** clean retry per intent.
3. Refuse anything after that.

It passed its tests and removed duplicate charges.

## What the model showed

I ran the brownout sweep on the full stack with and without the control, expecting it to help most under stress.

| Base timeout rate | Effective rate, full stack | Effective rate, full stack without the retry budget |
|---:|---:|---:|
| 4% | 10.7% | 4.2% |
| 6% | 41.8% | not measured |

The control made the brownout worse. One clean retry is still a retry, it goes out immediately, and with rails in place far more agent traffic reaches the issuer in the first place. Intent-derived idempotency on its own parks the retry as `pending` and sends nothing upstream.

## Decision

Add a circuit breaker to the control. The gateway keeps the last 200 issuer answers. When more than 2.5% of them are timeouts, no retry reaches the issuer: the caller gets `circuit_open` and the first attempt of each new payment still goes through.

## Consequences

- Effective timeout rate under the recommended stack now tracks the base rate: 4.4% at a 4% base.
- Some sales are lost while the breaker is open. That is the trade.
- With intent-derived idempotency in place, the retry budget still adds almost nothing to the gateway's net in this model. The ablation table shows it. It stays as defence in depth for integrations that cannot use intent keys, and I would ship idempotency first.
- The threshold and window are fixed numbers. A production breaker would need half-open probing and per-issuer state.
- The general point: a control named for a failure mode can feed that failure mode. The only way I found out was by measuring the system with the control in it.
