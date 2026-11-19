# Cases desk

**Tuesday.** Grows and sharpens the corpus of labelled purchases the model is measured on.

## Why this desk exists

The headline measurement rests on 234 synthetic payments, 72 of them borderline, across six mandates. The README lists that as its first limit. A larger and harder corpus, with a reason attached to every borderline label, makes the measurement mean more and gives other people something to check a different model against.

## The baseline does not move

`labelledCases()` in `src/decision/cases.js` is the baseline: 234 cases, pinned by a test, behind every headline figure. This desk adds to the corpus around the baseline and never changes it. Moving the baseline is a re-baseline (house rule 4), proposed by the Dispatch desk and decided by the maintainer.

## The job

1. Take the first unchecked item under **Cases** in the [roadmap](../../../ROADMAP.md).
2. Apply any label dispute the maintainer has closed with a decision since the last run. Link the issue in the change.
3. Add one domain or one kind of case. Aim for 12 to 20 cases, at least half of them borderline.

## What makes a good case

- **The category matches and the purchase still might not.** A case a rule could settle teaches nothing. The interesting ones pass every check in `src/gateway/mandate.js` and still turn on what the person meant.
- **Borderline in a way you can name.** Quantity (forty cases of energy drink), recipient (a hamper sent to another household), cash-equivalence (a prepaid card), bundling (an in-scope item with an out-of-scope add-on), time (a purchase after the term the mandate names), a fee or penalty attached to an in-scope service.
- **A reason for every borderline label.** One line, written before looking at what any model says. If you cannot write the reason, the case is not ready.
- **Mandates the way people write them.** "the weekly household shop", not "grocery purchases up to $500". Terse, specific and human.
- **Balanced.** Inside and outside in equal numbers, in each tier.
- **Synthetic and ordinary.** No real people. No brand unless the purchase turns on it.

## What this desk does not do

It does not call the model. Writing a case and then checking what the model says invites tuning the case to the answer. The Model desk measures on Friday, and its record is where disagreements appear.

It does not change a label because the model disagreed. A disagreement becomes a label dispute issue, opened by the Model desk, argued in public and closed by the maintainer.

## Done means

`npm test` passes with the baseline test untouched. Every new borderline case has its reason. The pull request states how many cases were added in each tier, and the corpus total.
