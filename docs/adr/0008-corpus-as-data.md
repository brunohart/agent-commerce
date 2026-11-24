# 0008. The case corpus is data

**Status:** proposed

## Context

The 234 labelled payments the model is measured on lived as arrays inside `src/decision/cases.js`. Ids, amounts, mandate limits and the `unattended` flag were all computed by the code. To read the corpus, extend it or load it from another language, you had to read and run JavaScript. The borderline labels had no reasons, so a label dispute had nothing to argue with but the label.

The corpus needs to grow to about a thousand cases ([roadmap](../../ROADMAP.md), Cases), and other people should be able to measure other models against it.

## Decision

The corpus moves to JSON files under `cases/`, one file per set. The layout is described in [`cases/README.md`](../../cases/README.md).

- **Nested: set, then mandate, then item, then payment.** A mandate is written once and an item's label and reason are written once, however many amounts it is asked at.
- **Everything explicit.** Each payment's id and amount are in the file. So are each mandate's limits and whether its point of sale is unattended. Nothing has to be derived from a position or a category.
- **`baseline.json` is frozen.** It was generated from the old code. A test pins a SHA-256 hash of everything the model is asked about each payment, in order. The hash was taken from the in-code corpus before the move and matches after it.
- **Every borderline item carries a one-line `reason`.** A test fails without one. The reason is never part of the request, and a test checks that too.
- **`currency` is stated per set.** The request sends every amount as NZD, and a test fails if a set says otherwise.

## Alternatives

- **JSON Lines, one payment per line.** The simplest loader of all, but it repeats the mandate and the reason on every payment, and hides which payments are the same item at different amounts.
- **CSV.** No nesting, and purposes contain commas. Quoting rules differ between readers.
- **YAML or TOML.** Easier to write by hand, but neither is in the standard library of Node, Go or Python. House rule 1.
- **Keep the code and add an export script.** Contributors would still have to write JavaScript to add a case.

## Consequences

- `labelledCases()` returns the same 234 cases in the same order, each with a new `reason` field: a string on borderline cases, `null` on clear ones. `loadCaseSet(name)` loads any set.
- No figure moves. `npm run report` produces the same files.
- The measurement still uses the baseline only. Measuring new sets as well is the Model desk's to decide.
- The 36 borderline reasons in the baseline were written after its labels, by a scheduled run, from the mandate and the label alone. They state why the label is what it is. They do not settle whether it is right.
- Per-payment context, for cases where the agent was not authorised, is not in the layout yet. The set-level `context` is where it would start.
