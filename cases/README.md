# Cases

Synthetic purchases, each labelled inside or outside what a mandate describes. The model is measured on whether it can tell which. Plain JSON, so any language can load it with its standard library. Why it is laid out this way: [ADR 0008](../docs/adr/0008-corpus-as-data.md).

| File | What it is |
|---|---|
| [`baseline.json`](baseline.json) | The 234 payments behind every headline figure. Frozen. |

## Layout

One file per set. A set holds mandates, a mandate holds items, and an item holds the payments the model is asked about.

```jsonc
{
  "set": "baseline",                    // the file's own name
  "frozen": true,                       // true: changing it is a re-baseline
  "about": "...",
  "currency": "NZD",                    // the unit of every amount
  "context": { "attested": true, "mandateVerified": true, "spent": 0 },
  "mandates": [{
    "purpose": "public transport fares for commuting to work",
    "category": "transport",            // the merchant category on every payment
    "maxPerTxn": 500, "maxTotal": 2000, // the mandate's limits, NZD
    "unattended": false,                // nobody is present at the point of sale
    "items": [{
      "item": "fee to replace a lost transit card",
      "tier": "hard",                   // "clear" or "hard" (borderline)
      "label": "inside",                // "inside" or "outside" the mandate
      "reason": "The card is how the commute's fares are paid, so ...",
      "payments": [
        { "id": "hard-4-in-2-0", "amount": 18 },
        { "id": "hard-4-in-2-1", "amount": 120 }
      ]
    }]
  }]
}
```

The comments are for this page only. JSON has none.

Each payment becomes one case: the mandate's fields, the item, the amount and the set's `context` (with the mandate's `unattended`). [`src/decision/cases.js`](../src/decision/cases.js) is the whole loader. The label and the reason are never sent to the model.

## Rules

- **The baseline does not move.** A test pins everything the model is asked about it. Changing a case, an amount or an id there is a re-baseline ([`AGENTS.md`](../AGENTS.md), rule 4).
- **A label changes only through a label dispute** the maintainer has closed, and the change links to it (rule 5).
- **Every borderline item has a reason.** One line, written before looking at what any model says. A test fails without it. Clear items may have one.
- **Ids are unique across every file.** A new set should prefix its ids with its own name.
- **Synthetic only.** No real people, merchants or transactions.

New sets go in a new file. Read the [Cases desk playbook](../docs/operations/desks/cases.md) for what makes a good case.
