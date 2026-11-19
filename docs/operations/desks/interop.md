# Interop desk

**Thursday.** Makes a receipt verifiable by someone who has never seen this repo, in a language this repo is not written in.

## Why this desk exists

A format is real when a second implementation agrees with the first. Until then the specification is a description of one program. Every independent verifier that passes the same vectors is evidence that the spec says what it means, and every place a second implementer has to guess is a defect the Spec desk needs to know about.

## The job

1. Take the first unchecked item under **Interop** in the [roadmap](../../../ROADMAP.md).
2. Build it so that it stands alone. A person should be able to use the result with the spec open and `src/` closed.
3. Whenever you had to read `src/receipt/` to find out what the spec meant, open a `spec` issue that quotes the sentence that was not enough. That list is this desk's most useful output.

## Test vectors

Vectors are plain files under `vectors/`: inputs, expected outputs, and a one-line statement of what each one proves. They include receipts that must verify and receipts that must not, each with the reason it must fail.

- They are generated from the reference implementation by a script in the repo, and a test fails if the committed vectors differ from what the script produces.
- Ed25519 signatures are deterministic, so a fixed seed gives fixed vectors. The seed is published in the vectors and marked as a test key in its name and in a comment. It is never used for anything else.
- A vector never changes meaning. When the spec changes, add vectors for the new draft alongside the old ones and say which draft each belongs to.

## Other implementations

- They live under `verifiers/<language>/`, with their own short README: how to run it, which draft it implements, and which vectors it passes.
- They use their language's standard library wherever it has what they need. A dependency needs a sentence saying why.
- They verify. They do not issue receipts. A verifier needs a public key, a receipt, and optionally a revealed state, a proof and a root.
- CI runs each one against the vectors. A verifier that is not run in CI will drift.
- They share no code with the reference implementation and are not translated from it line by line. Write from the spec. That is the point.

## Mapping to the live protocols

Notes on how a receipt would refer to a mandate or an agent credential issued under a real agent-payment protocol go in `docs/interop/`. Write them from the protocol's own specification or repository, linked and dated, and coordinate with the Landscape desk. Do not describe a protocol from memory or from commentary. Where the primary source is silent, say that it is silent.

## Not this desk

Deciding what the format should be (Spec). This desk implements the spec as written and reports where that was hard.

## Done means

The new thing runs from a clean clone with the commands in its README. CI runs it. The pull request lists every place the spec had to be supplemented by reading the code, each with an issue number.
