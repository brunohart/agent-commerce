# 0002. Pipeline stage order

**Status:** accepted

## Context

The pipeline has eight stages. Most of the order is forced (you cannot capture before you authorise). Where idempotency sits is a real choice, and both obvious positions are wrong.

- **First**, before anything else: an unauthenticated caller can present a guessed key and read back a stored result for someone else's payment.
- **Last**, just before the issuer: a replayed request runs the mandate check again. The first attempt already spent budget, so the replay is refused as over budget and the caller is told a successful payment failed.

## Decision

```
protocol → attestation → idempotency → mandate → risk → authentication → issuer → ledger
```

Idempotency sits after attestation and before the mandate check. Stored results are only ever returned to a caller whose identity has been verified, and a replay returns before any stateful check runs.

A request rejected after the idempotency stage (mandate, risk, retry budget) stores that rejection, so the same request gets the same answer.

A request whose outcome is unknown does **not** release its key. In client-key mode it does, because that is how gateways behave today and it is the source of the duplicate charge the trace demonstrates.

## Consequences

- `pipeline: a replay does not spend the mandate budget twice` pins this in a test.
- An intent that failed definitively must have its entry cleared explicitly, or it can never be retried. The status-inquiry path does this.
- The intent key is derived from mandate, merchant, cart and amount. Two genuinely separate purchases of the same cart for the same amount collapse into one. A real implementation needs a time window or a merchant-supplied order reference in the key.
