# 0007. Every model-backed decision leaves a conformance receipt

**Status:** accepted

## Context

The mandate layer already kept the mandate as dispute evidence. That shows what the human authorised. It does not show that anyone checked the purchase against it, and it is a record the gateway holds alone and could have written at any time.

Two things changed the weight of that gap. No card network rule currently allocates liability when an agent buys the wrong thing, so disputes turn on evidence. And the decision is now made by a model whose answer is a number from a pinned version about a defined state, which is a thing that can be signed.

## Decision

Issue a receipt for every decision the model takes part in, approvals and declines alike.

- The receipt binds the mandate (by signature hash), the pinned model id, hashes of the state and questions, the stated and recalibrated probabilities, and the action.
- It is signed with the gateway's Ed25519 key over canonical JSON.
- Its hash is appended to a Merkle log. The root is published.
- It contains hashes and not payment details. The state is revealed only in a dispute.

The format is specified in `docs/RECEIPT-SPEC.md` so that someone other than the issuing gateway can verify one.

## Why hashes and not the state

A receipt that carried the state would be a record of every agent purchase, held in a log designed never to be altered. Committing to a hash gives the same proof with nothing to leak, and lets the gateway choose what to reveal and to whom.

## Why declines too

A log of approvals alone proves that the gateway approved those payments. A log of every decision shows the rule was applied to everything, including where it cost a sale. It is also the only way a later reviewer can measure the false-decline rate.

## Consequences

- The `mandateEvidence` control now means the receipt. In the simulator, a receipt exists when mandate verification, the decision layer and evidence are all on.
- The bulk simulator does not sign receipts. Signing costs about 50 microseconds, which is nothing per payment and minutes across millions of simulated ones. The pipeline issues them when given a key, and `node src/cli.js receipt` and the tests exercise that path.
- The simulator gains a rules regime, `evidenceRecognised`. It is off by default, so no existing result changes. With it on, the stack's agent-dispute claims fall from 38 to 12 basis points of agent volume.
- Recalibration is recorded per receipt by its result (`calibrated`), not by its parameters. A reviewer can see the number acted on but cannot recompute it from the receipt alone.
- Not implemented: consistency proofs between successive roots, key rotation, and anywhere to publish a root. The spec lists them as open.

## What this does not claim

A receipt proves what the model said and that the gateway acted on it at the time. It does not prove the model was right, that the state was true, or that the mandate reflects what the human wanted.
