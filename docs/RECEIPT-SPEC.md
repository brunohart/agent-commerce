# Conformance receipt, draft 0.1

A conformance receipt is a signed record, issued by a payment gateway at authorisation, that a purchase made by an agent was checked against the mandate its human signed. This document specifies the format so that a party other than the issuing gateway can verify one.

It is a draft written by one person. It has no standing with any card network, regulator or standards body. Reference implementation: [`src/receipt/`](../src/receipt/).

## Why it exists

No card network rule currently allocates liability when an agent buys the wrong thing. Disputes about agent purchases run through existing reason codes and are won or lost on whether the merchant can show what the customer authorised the agent to do. A record made at the time of the payment, which cannot be altered or invented afterwards, is the strongest form that evidence can take.

## Format

A receipt is a JSON object.

| Field | Type | Meaning |
|---|---|---|
| `v` | integer | Format version. `1`. |
| `paymentId` | string | The gateway's identifier for the payment attempt. |
| `issuedAt` | number | When the decision was made. |
| `mandate.id` | string | Identifier of the mandate the agent presented. |
| `mandate.signatureHash` | hex | SHA-256 of the mandate's signature. Binds the receipt to one signed mandate. |
| `model` | string | The full model id that answered, as returned by the model's API. Never an alias. |
| `stateHash` | hex | SHA-256 of the canonical JSON of the state sent to the model. |
| `questionsHash` | hex | SHA-256 of the canonical JSON of the questions sent. |
| `stated` | object | Question id to the probability the model returned. |
| `calibrated` | object | Question id to the probability after the gateway's recalibration. |
| `action` | string | `approve`, `step_up` or `decline`. |
| `ev` | object | The expected value the gateway computed for each action. |
| `signature` | base64 | Ed25519 signature by the gateway over the canonical JSON of every other field. |

**Canonical JSON** is JSON with object keys sorted at every level and no insignificant whitespace.

A receipt is issued for every model-backed decision, including declines. A log that contains only approvals proves less than one that contains every decision.

## What a receipt does and does not contain

It contains hashes of the state and questions, not the state and questions. Nothing about the cardholder, the item or the merchant can be read from a receipt. In a dispute, the gateway reveals the state; the verifier hashes it and compares.

It contains the model's stated probability and the calibrated one. A gateway that acted on a number different from the one the model gave must show both.

## The log

Receipts are appended to a Merkle tree. A leaf is `SHA-256("leaf:" + SHA-256(canonical receipt))`. An interior node is `SHA-256("node:" + left + ":" + right)`. A node with no sibling is carried up unchanged.

The gateway publishes the root at a fixed interval to a party it does not control. An inclusion proof is the list of sibling hashes from a leaf to the root: about 30 hashes for a billion receipts.

## Verification

Given a receipt, the gateway's public key, an inclusion proof and a published root, a verifier:

1. Checks the signature over the canonical JSON of the receipt without its `signature` field.
2. Recomputes the leaf and folds the proof. The result must equal the published root for a period that ends before the dispute was raised.
3. If the state, questions and mandate have been revealed: hashes each and compares with `stateHash`, `questionsHash` and `mandate.signatureHash`, and checks the revealed model id equals `model`.

Step 1 shows the gateway issued it. Step 2 shows it existed at the time. Step 3 shows what was asked.

## What a receipt does not prove

- That the model was right. It proves what the model said and that the gateway acted on it.
- That the state was true. A gateway can only attest to facts it derived or verified itself, which is why the reference pipeline keeps agent-supplied and merchant-supplied text out of the state.
- That the mandate reflects what the human wanted. It proves which mandate was presented.

## Open questions

- Who holds published roots, and at what interval.
- Whether `stated` and `calibrated` should be disclosed to the cardholder's issuer by default or only in a dispute.
- Key rotation and revocation for gateway signing keys.
- A consistency proof between successive roots, so a log cannot be forked. Not implemented.
- Whether declines should be disclosed to the agent's operator.
