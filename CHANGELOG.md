# Changelog

What changed, for someone deciding whether to look again. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The Dispatch desk adds to it each Sunday.

## Unreleased

### Added

- How the repo is run: a daily roster of seven desks, each with a playbook, in [`docs/operations/`](docs/operations/).
- A [roadmap](ROADMAP.md) with an ordered queue for each desk.
- Ways in for contributors: [`CONTRIBUTING.md`](CONTRIBUTING.md), issue forms for label disputes, failure modes and spec proposals, a pull request template, a code of conduct and a security policy.
- [`AGENTS.md`](AGENTS.md): the house rules for anyone changing the repo, person or agent.
- A CI check that the generated report, results and failure-mode register match what the code produces.
- `CITATION.cff`.

## 0.1.0 (16 to 19 November 2026)

Not yet tagged.

### Added

- **A reference agent-payment pipeline.** Mandates signed and verified with Ed25519, intent-derived idempotency, an expected-value risk decision, and a double-entry ledger.
- **Jev as the decision layer.** Two Nouls per agent payment, behind a guard: a deadline with a fallback, a pinned model version, recalibration against outcomes, and untrusted text kept out of the state.
- **A measurement of the real model.** 234 labelled payments sent to `jev-1.14.0`, with every answer in `docs/jev-measured.json`. The simulator replays what was measured.
- **A fault-injection simulator** and a register of twenty-one failure modes, each with a price.
- **A valuation.** Four bets, sixteen portfolios, 4,000 simulated worlds, with a Jevons volume term.
- **The conformance receipt.** Draft 0.1 of the specification, a reference implementation, an append-only Merkle log and inclusion proofs.
- A generated one-page report, the thesis, and seven decision records.
