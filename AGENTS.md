# Working in this repo

For people and coding agents alike. Short on purpose. The README says what the project is; this says how to change it without breaking what makes it trustworthy.

## Commands

```bash
npm test                   # 72 tests, about 3 seconds, offline
node src/cli.js trace      # one payment through two gateways, 1 second
npm run report             # regenerates docs/index.html, docs/results.json, docs/FAILURE-MODES.md (about 2 minutes)
node src/cli.js receipt    # issue a receipt, verify it, tamper with it, prove inclusion
node src/cli.js measure    # calls the live model. Read rule 4 first.
```

Node 20 or later. Nothing to install.

## House rules

1. **No dependencies.** The reference implementation uses the Node standard library and nothing else. Verifiers in other languages keep to their own standard library wherever it has what they need.
2. **Every prior lives in [`src/assumptions.js`](src/assumptions.js).** A number that is not measured and not derived goes there, with a comment saying why it is defensible. No magic numbers anywhere else.
3. **Generated files are generated.** `docs/index.html`, `docs/results.json` and `docs/FAILURE-MODES.md` come from `npm run report`. Never edit them by hand. If a change moves a figure, regenerate, and update any figure the README or thesis quotes in the same pull request. CI fails when the committed files differ from what the code produces.
4. **The measured baseline is not edited.** `docs/jev-measured.json` is written by `measure` and sits behind every headline figure. Replacing it is a re-baseline: its own pull request, titled `baseline:`, with nothing else in it.
5. **Labels are not tuned.** A label in the case corpus changes only through a label dispute that the maintainer has closed, and the change links to it. Never change a label, a case or a test because the model got it wrong.
6. **A failure mode arrives with a test.** The test shows the failure happening without its guard. If there is no guard, the register says "none" and the README says so plainly.
7. **Never weaken a test to get green.** A failing test is information.
8. **Design decisions get a record.** One file in [`docs/adr/`](docs/adr/), in the form the existing ones use.
9. **Claims about the outside world carry a dated source.** Card network rules, protocols, companies, regulators. Prefer the primary source. Mark a secondary source as secondary. Where sources disagree, say that they do.
10. **Synthetic data only.** No real cardholder, merchant, transaction or company data. No keys or tokens, ever.
11. **Say what it does not show.** Every result names its limits. The README's Limits section is part of the result, and grows when a result is added.

## Writing

Plain words and short sentences. New Zealand English: authorise, licence (noun), programme. No sales language. A number comes with its unit and where it came from.

The README and the thesis are written in the maintainer's first person. Text written by a scheduled run is not, and does not speak for the maintainer.

## Things that are easy to miss

- The PNGs in `docs/img/` are not produced by `npm run report`. If a change makes one stale, say so in the pull request.
- A test pins the baseline corpus at 234 cases. That is deliberate (rule 4).
- `measure` overwrites `docs/jev-measured.json`. Do not commit that change unless the pull request is a re-baseline.

## Where the work is

[`ROADMAP.md`](ROADMAP.md) is the queue. [`CONTRIBUTING.md`](CONTRIBUTING.md) is the way in. [`docs/operations/`](docs/operations/) is how the repo is run day to day.
