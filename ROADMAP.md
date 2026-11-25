# Roadmap

This is the queue. Each track belongs to one desk in [`docs/operations/`](docs/operations/), which takes the first unchecked item when its day comes round. The order within a track is the priority, and it is set by the maintainer.

Anyone can take an item. Open an issue saying which one, so that two people do not do it twice. Items are intentions and leads, not promises: several say "check whether", and the honest result of checking may be "no".

Where it is heading:

- **A receipt specification that a second party can implement**, with test vectors and at least two independent verifiers that agree.
- **A corpus of a thousand labelled purchases**, half of them borderline, each borderline label with a reason, open for any model to be measured against.
- **A failure-mode register that keeps growing**, including the entries that have no fix.
- **A week-by-week public record** of how a System One model performs on this one judgement.
- **A sourced page on where the rules stand** for agent payments.

---

## Spec

Desk: [Spec](docs/operations/desks/spec.md), Mondays. Target: `docs/RECEIPT-SPEC.md` from draft 0.1 to 1.0.

- [ ] **Bind the answer to the model.** Today `stated` is the gateway's own account of what the model returned, and nothing in a receipt lets a third party check it. Specify a check they can run: replay the revealed state and questions against the pinned model and compare within a stated tolerance, and optionally an answer signed by the model's provider. Say what happens when a pinned version is retired.
- [ ] **Numbers and time on the wire.** Probabilities, expected values and `issuedAt` are floating-point, and languages print floats differently. Either adopt RFC 8785 (JSON Canonicalization Scheme) by reference, or move to integers (parts per million, milliseconds). A second implementation cannot agree on a hash until this is settled.
- [ ] **Tree hashing.** The log promotes an unpaired node, which gives the same tree shape as RFC 6962, but it hashes hex strings with text prefixes. Check whether adopting RFC 6962 hashing over bytes would let existing transparency-log tooling verify a proof, and decide.
- [ ] **Proofs that carry position and size.** An inclusion proof names neither the leaf index nor the tree size. Add both, and add consistency proofs between successive roots so a log cannot be forked.
- [ ] **Publishing a root.** Define the signed checkpoint (size, root, time, signature) and what "a party the gateway does not control" has to do with it. Evaluate existing checkpoint and witness formats before writing a new one.
- [ ] **One payment, one receipt.** Nothing stops a gateway logging two receipts for one payment, over two different states, and revealing whichever suits it later. Specify uniqueness of `paymentId` within a log and how a verifier could check it.
- [ ] **Keys.** A key identifier in the receipt, rotation, revocation, and how a verifier finds the key that was valid on the day.
- [ ] **Recalibration.** A receipt records the calibrated number and not how it was produced ([ADR 0007](docs/adr/0007-conformance-receipts.md)). Commit to the calibration in force, by hash and version, so a reviewer can recompute it.
- [ ] **Selective reveal.** Revealing the state reveals all of it. Consider a commitment per field, so a gateway can show the item without showing the rest.
- [ ] **Conformance language.** Rewrite the requirements as MUST and SHOULD for issuers and for verifiers, with a threat model that names each adversary and what each proof holds against them.
- [ ] **Who described the item.** The state says what is being bought in the caller's words, and a receipt commits to it without saying whose words they are. A gift card described as groceries is approved, and its receipt verifies ([#15](https://github.com/brunohart/agent-commerce/issues/15), found by the Red-team desk). Specify how the state and the receipt record who described the item and what the gateway checked it against, and correct "What a receipt does not prove". Changing the state changes what the model is asked, so the change needs a new measurement.

## Interop

Desk: [Interop](docs/operations/desks/interop.md), Thursdays. Target: anyone can verify a receipt, in their own language, in five minutes.

- [ ] **Test vectors.** A fixed test key, receipts that must verify, receipts that must fail and why, a small log with its roots and proofs, and canonical-JSON cases. Plain files under `vectors/`, generated from the reference implementation, checked in CI.
- [ ] **A verifier that takes files.** `node src/cli.js verify receipt.json --key gateway.pem`, with optional `--state`, `--proof` and `--root`, and an exit code. Today's `receipt` command is a demonstration, not a tool.
- [ ] **A second implementation.** A Go verifier using only the standard library, written from the spec, run against the vectors in CI. Expect it to find what the spec leaves unsaid.
- [ ] **Verify in the browser.** One static page with no dependencies. Paste a receipt and a public key and watch it verify. Change one character and watch it fail.
- [ ] **A third implementation**, in Python.
- [ ] **Mandates from elsewhere.** How a receipt would refer to a mandate or agent credential issued under the live agent-payment protocols. Written from their own specifications, with the Landscape desk.
- [ ] **Packaging.** The receipt code as a dependency-free package. Needs the maintainer's registry account.

## Cases

Desk: [Cases](docs/operations/desks/cases.md), Tuesdays. Target: 1,000 cases, at least half borderline, every borderline label with a reason.

- [ ] **Corpus as data.** Move the cases into plain files that anyone can read, extend and load from another language. Keep the 234-case baseline frozen and its test untouched. Add a one-line reason to every borderline label, written without consulting a model. Record the layout in an ADR.
- [ ] **Open the two disputes the README already names.** A rideshare to the office under a public-transport mandate, and the fee to replace a lost transit card. One `label-dispute` issue each, taking no side.
- [ ] **Unattended, first set.** Vending machines and micro-markets, pay-at-pump fuel, car wash and laundromat. Nobody is present to answer a challenge.
- [ ] **Subscriptions and renewals.** A price rise, a plan upgrade, a switch from monthly to annual, a trial that converts.
- [ ] **Purposes with a "not" in them.** "Nothing alcoholic." "No in-app purchases." Negative constraints are a different kind of judgement.
- [ ] **Baskets.** One in-scope item with one out-of-scope add-on, at varying shares of the total.
- [ ] **Unauthorised cases.** Every case so far was authorised, so only one of the two Nouls has been scored. Add cases where it was not.
- [ ] **More domains.** Travel, pharmacy, trade supplies, household bills, gifts, event tickets.
- [ ] **Mandates the way people write them.** Terse, misspelt, mixed-language, ambiguous on purpose.

## Red team

Desk: [Red team](docs/operations/desks/red-team.md), Wednesdays. Target: a register that keeps growing, with a test behind every entry.

These are leads. Each is checked against the code before anything is claimed.

- [ ] **Who wrote the item description?** The field the judgement turns on arrives with the request, written by the agent or the merchant. Show what a mislabelled item does to the decision, and what a gateway could verify in its place.
- [ ] **A receipt that fails after a round trip.** `stable()` writes a key whose value is `undefined` as `null`. `JSON.stringify` drops it. Check whether an honest receipt can fail to verify once its state has been to JSON and back.
- [ ] **Two states, one hash.** `stable()` also maps `NaN` and `Infinity` to `null`. Look for two different states that commit to the same hash.
- [ ] **One receipt, many spellings.** The log leaf hashes the receipt including its base64 signature, and base64 decoding is forgiving. Check whether one signed receipt can be written more than one way, and what that does to inclusion.
- [ ] **A budget spent twice.** `spent` is what this gateway has authorised. Model an agent presenting one mandate at several gateways.
- [ ] **Steering into the fallback.** A slow answer sends the payment to the static rule. Find out whether an attacker can cause that, and whether the fallback is ever the softer path.
- [ ] **A price for selective labels.** F21 has no guard. Cost out a small exploration budget: approve a capped share of payments the rule would decline, to learn what they would have done.
- [ ] **Fields that collapse.** A mandate with no purpose and a mandate with an empty purpose sign the same bytes. Look for others.
- [ ] **Keys derived from intent.** Check whether one party can predict another's idempotency key and use it to block or pre-empt their purchase.

## Model

Desk: [Model](docs/operations/desks/model.md), Fridays. Target: an unbroken weekly record.

- [ ] **Record mode.** `node src/cli.js measure --record` writes to `docs/record/` and leaves the baseline alone: one answers file per run, one index with a summary row per run. Tested offline with the fake client.
- [ ] **An interval on skill.** A bootstrap interval on AUC for each tier, in the measurement output and in the record. The README says "a few points". Say how many.
- [ ] **Start the record.** From here on, every Friday adds a row.
- [ ] **Run-to-run variance.** Ask the same set three times in one sitting and report how far the answers move. This is the tolerance a replay check would need (see Spec).
- [ ] **The record in the report.** A chart of skill, calibration and latency by week in `docs/index.html`.
- [ ] **A second model for comparison.** The same corpus through a different kind of model. Needs the maintainer's key.

## Landscape

Desk: [Landscape](docs/operations/desks/landscape.md), Saturdays. Target: the page people check to see where the rules stand.

- [ ] **Create `docs/LANDSCAPE.md`** by checking each claim under "Sources and facts to verify" in the thesis against a primary source. Record what was found, including what could not be reached.
- [ ] **Network rules.** The current text on liability for agent-initiated purchases, from the rulebooks where they can be read.
- [ ] **Protocols.** For each live agent-payment protocol: status, how it represents what the human authorised, and whether it defines evidence that an acceptor checked.
- [ ] **Standards the receipt could adopt.** Transparency logs and witnesses, signed statements, canonical JSON, verifiable credentials.
- [ ] **Regulation.** New Zealand and Australia first, then the EU, the UK and the US.

After that the job is the weekly check, and most weeks nothing will have changed.

## Front door

Desk: [Dispatch](docs/operations/desks/dispatch.md), Sundays. Target: a stranger can go from the README to a merged contribution without asking anyone anything.

- [ ] **Figures checked by a test.** Every number the README quotes is compared with `docs/results.json` and `docs/jev-measured.json` in `npm test`, so a figure cannot drift from its source.
- [ ] **Images that can be regenerated.** A script that produces `docs/img/` from the report, so a figure never outlives the number it shows.
- [ ] **The shelf.** Three to five `good first issue` items open at all times.
- [ ] **First release.** Tag 0.1.0. Needs the maintainer.
- [ ] **The report as a page.** Publish `docs/` with GitHub Pages so the report has a link. Needs the maintainer.
