# Model desk

**Friday.** Measures the model again and adds one row to a record that nobody else is keeping.

## Why this desk exists

The repo measured `jev-1.14.0` once, in November 2026. A model in a payment path changes: a new version ships, an alias moves, latency shifts. Failure mode F19 is about exactly that. A single measurement shows the model could do the job on one day. A weekly record shows whether it still can, and it is the nearest thing an outsider can build to the outcome record a gateway would keep.

## Two files, kept apart

- **The baseline**, `docs/jev-measured.json`. It sits behind every headline figure. This desk never changes it (house rule 4).
- **The record**, under `docs/record/`. Append-only. One file per run with every answer, and one index with a summary row per run. This desk writes here and nowhere else.

`node src/cli.js measure` overwrites the baseline as it stands today. The first roadmap item gives it a record mode. Until that is merged, this desk does not run a measurement.

## The job

1. If there are unchecked build items under **Model** in the [roadmap](../../../ROADMAP.md), take the first. One per run.
2. Once record mode exists, every run also takes the measurement:
   - Measure the whole corpus against the pinned model. One pass, at the harness's default concurrency, with no retries beyond what the harness does.
   - Ask the moving alias which model it resolves to. If that differs from the pin, measure that model as well.
   - Append to the record: the date, the model id the API returned, cases asked and answered, AUC by tier with its interval, the calibration slope, median and 95th percentile latency, the share answered inside the gateway's deadline, and errors by kind.
3. Compare the new row with the previous one and with the baseline. Open an issue labelled `model` if:
   - the alias resolves to a model that is not the pin,
   - skill on the borderline tier has moved outside the previous interval,
   - the calibration slope has moved by more than a quarter,
   - fewer than 95% of calls were answered inside the deadline, or any call failed.

   Put the two rows side by side in the issue. Say what moved. Do not say why unless the record shows it.
4. For up to two borderline cases where the model is confidently on the other side of the label, open a `label-dispute` issue. Put the mandate and the purchase in the title as a question. Give the label, the reason recorded for it, and the model's number, and take no side. Skip a case that already has a dispute, open or closed.

## Rules for the measurement

- **Never change the pin.** Moving `PINNED_MODEL` is a re-baseline and is the maintainer's decision. This desk reports that a newer model exists and how it measured.
- **Never drop a run.** A run where the API failed, or the numbers look bad, is recorded as it happened. A record with gaps where the results were unwelcome is worth nothing.
- **Never invent a number.** If the API cannot be reached, record the failure and stop. Open an issue only after two failed runs in a row.
- **The key stays out of the repo and out of the logs.** The client reads `TYPESAFE_API_KEY` from the environment. Where the environment supplies the credential at the network layer, any placeholder value will do.
- **Mind the bill.** One pass per model per week. Do not re-run to get a nicer number.

## Not this desk

Writing cases (Cases). Deciding a dispute (the maintainer). Replacing the baseline (a `baseline:` pull request, proposed by Dispatch).

## Done means

One new row in the record and one new answers file, both committed. `npm test` passes. `docs/jev-measured.json` is unchanged in the diff. The pull request shows the new row beside the previous one.
