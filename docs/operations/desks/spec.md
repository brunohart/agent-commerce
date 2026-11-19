# Spec desk

**Monday.** Moves [`docs/RECEIPT-SPEC.md`](../../RECEIPT-SPEC.md) one step closer to something a second party could implement and a rule-maker could cite.

## Why this desk exists

A receipt that only its issuer can read is a filing system. The format has to be exact enough that two people who have never spoken produce the same bytes and reach the same verdict. Draft 0.1 is not there yet, and its own open questions say so.

## The job

1. Take the first unchecked item under **Spec** in the [roadmap](../../../ROADMAP.md). An open `spec` issue that the maintainer has marked `accepted` goes ahead of it.
2. Make one change. A spec change is a single pull request that moves four things together:
   - the text of `docs/RECEIPT-SPEC.md`,
   - the reference implementation in `src/receipt/`,
   - the tests in `test/receipt.test.js`, including a case that would have passed before and must fail now, or the reverse,
   - the test vectors, once the Interop desk has created them.
3. If the change is a design decision between real alternatives, write an ADR that names what was rejected and why.
4. Record the change under a "Changes" heading at the end of the spec, with the draft number it belongs to.

## How to decide

- **Borrow before inventing.** Where a published standard already answers the question (canonical JSON, Merkle tree hashing, signed checkpoints, key identifiers), adopt it by reference and say which section. Read the standard itself before citing it. A new format needs a reason the existing one cannot serve.
- **A verifier holds nothing but public material.** If a check needs something only the gateway has, it is not a verification step.
- **Reveal as little as the proof needs.** The receipt commits to hashes for a reason ([ADR 0007](../../adr/0007-conformance-receipts.md)).
- **Say what the receipt does not prove.** Every change updates that section if it moves the boundary in either direction.
- **Breaking changes bump `v`.** State in the pull request whether a receipt issued under the previous draft still verifies.

## When the item is too big

Most roadmap items here are more than one week. Split them: a proposal issue this week that lays out the options and recommends one, the change next week once the maintainer has agreed. A proposal issue with no pull request is a complete run.

## Not this desk

Writing verifiers in other languages (Interop). Finding attacks (Red team), though an attack that lands becomes a spec item here. Describing what networks and protocols do (Landscape).

## Done means

The spec text, the code and the tests agree. `npm test` passes. A reader with the spec and no access to `src/` could implement the changed part.
