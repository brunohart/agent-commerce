# Contributing

This project argues that an agent's purchase should be checked against what its human meant, and that the check should leave proof. It gets better when people disagree with it in specific ways. There are five ways in. None needs permission, and the first two need no code.

## 1. Argue with a label

The case corpus is a set of purchases, each labelled inside or outside what a mandate describes. The borderline labels are one person's judgement, and some are arguable. Is a rideshare to the office a "public transport fare for commuting"? Is the fee to replace a lost transit card?

If you think a label is wrong, or you have a purchase that sits right on the edge, open a **label dispute**. Say what the mandate was, what was bought, which way you would label it, and why. A good dispute is worth more than a hundred easy cases.

## 2. Break it

The repo's method is to attack its own design and price what happens. Twenty-one failure modes are in the [register](docs/FAILURE-MODES.md). There are more.

If you can see a way to forge a receipt, backdate one, get planted text in front of the model, spend a budget twice, or make the gateway lose money in a way the register does not list, open a **failure mode** issue. Describe the trigger and what it costs. A failing test is the best possible form, and prose is fine.

If what you found would let someone forge or alter a receipt that verifies, please use the private route in [`SECURITY.md`](SECURITY.md) first.

## 3. Verify a receipt somewhere else

A receipt format is only real when someone other than its author can verify one. Write a verifier in your language against [`docs/RECEIPT-SPEC.md`](docs/RECEIPT-SPEC.md). Wherever the spec left you guessing, that is a defect in the spec: open an issue saying where.

## 4. Propose a change to the spec

The spec is a draft, and its open questions are listed at the end of the document and in the [roadmap](ROADMAP.md). Open a **spec proposal**. State the problem, the change, and what it would break. A spec change lands as one pull request that changes the text, the reference implementation and the tests together.

## 5. Fix or improve something

Bugs, unclear documentation, a quickstart step that tripped you. Small pull requests are welcome without an issue first. For anything larger, open an issue so the work is not wasted.

## Before you open a pull request

```bash
npm test          # must pass
npm run report    # only if you touched src/. About 2 minutes. Commit what it regenerates.
```

Read [`AGENTS.md`](AGENTS.md). It is one page, and it holds the rules that keep the numbers honest: no dependencies, every prior in one file, generated files never edited by hand, labels never tuned, tests never weakened.

Keep a pull request to one change that can be reviewed in ten minutes.

## How decisions are made

One maintainer merges. Design decisions are written down in [`docs/adr/`](docs/adr/). Label disputes are closed by the maintainer with a reason, and the reason stays in the issue. Disagreement with a closed decision is welcome as a new issue that brings something new.

## Who you are talking to

Routine upkeep is done by scheduled agent runs, described in [`docs/operations/`](docs/operations/). A run may label your issue and answer a question that the repo itself can answer, and it will say that it is a run. It does not make judgement calls, close issues or merge anything. Those are the maintainer's.

## Conduct

Be specific, be kind, argue about the work. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Licence

Contributions are accepted under the repository's [MIT licence](LICENSE).
