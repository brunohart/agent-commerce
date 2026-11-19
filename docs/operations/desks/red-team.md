# Red-team desk

**Wednesday.** Attacks the design, on purpose, and writes down what happens.

## Why this desk exists

The repo's claim to be taken seriously is that it attacked itself first and priced the damage. The register has twenty-one entries. Some of them are there because they are uncomfortable. That only stays credible if the attacking never stops, and if a finding that hurts is published as readily as one that flatters.

## The job

1. Take the first unchecked item under **Red team** in the [roadmap](../../../ROADMAP.md). An open `red-team` issue from someone outside the project goes ahead of it. Their finding gets worked first and they are credited by name.
2. **Check the lead against the code.** The roadmap lists leads, not conclusions. Read the code path and establish whether the weakness is real. If it is not, say so in the roadmap item, with the reason, and take the next one. A lead that was checked and came to nothing is a complete run.
3. **Write the failing test first.** It shows the attack succeeding against the current code.
4. Then do one of three things:
   - **Guard it**, if the guard is small and clearly right. The test now shows the attack failing.
   - **Hand it to the Spec desk**, if the weakness is in the format itself. Open a `spec` issue, add the item to the roadmap, and leave the test in place, marked as a known gap that links to the issue.
   - **Register it as unmitigated**, if there is no good guard. Say so plainly.

## Two kinds of finding

- **A weakness in the implementation or the format.** Canonical JSON, signatures, the log, mandate verification, the guard, idempotency, the ledger. A test, and a fix or a spec issue. No figure moves. Most weeks are this.
- **A failure mode with a price.** A new way for the gateway, the merchant or the cardholder to lose money, which belongs in `src/sim/failure-modes.js` with a trigger and a cost. This changes the simulator, and that moves headline figures. Do it only when the mechanism is clear and the prior can be defended. Put the prior in `src/assumptions.js`, regenerate the report, and title the pull request `red-team: F<nn> <name> (figures move)`.

## How to attack

Think as each party in turn: an agent's operator, a merchant, a cardholder who regrets a purchase, and the gateway itself. The receipt exists to hold the gateway to account, so the gateway is an adversary of the receipt. Ask what each of them controls, what they gain, and what the verifier can see.

Useful questions:

- Where did this field come from, and who could have written it?
- What does this check not bind?
- Can two different things produce the same bytes?
- Is the fallback softer than the path it replaces?
- What does this guard assume about what other gateways can see?

## Not this desk

Rewriting the spec (Spec). Adding ordinary cases (Cases). Chasing an attack on a real system: this is a reference implementation, and nothing outside this repo is ever probed.

## Done means

A test that fails without the guard and passes with it, or a test marked as a known gap with an issue behind it. The register and the README's Limits are updated if a failure mode was added. The pull request says in one sentence what an attacker could do before the change and what they can do after it.
