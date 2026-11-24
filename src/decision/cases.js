// Labelled payments for measuring Jev on the one judgement this gateway asks of it:
// does the item fall outside what the mandate describes, even though the merchant
// category matches?
//
// The cases are data, in cases/<set>.json, so that anyone can read, extend and load
// them without this code. The layout is described in cases/README.md and the
// decision behind it in docs/adr/0008-corpus-as-data.md.
//
// Two tiers, both synthetic:
//   clear  unmistakable cases. The first run of this set showed Jev separates them
//          perfectly, which says it can do the task and nothing about how well.
//   hard   borderline cases, where the item sits near the edge of the purpose. Each
//          carries a one-line reason for its label. The labels are the maintainer's
//          and a reasonable person could argue with some of them. This tier is where
//          skill and calibration become measurable.
// Neither is a gateway's real disputes, and a pilot should replace both with those.

import { readFileSync } from 'node:fs';

export const CASES_DIR = new URL('../../cases/', import.meta.url);

/**
 * One case per payment in a set, in file order. The reason travels with the case
 * for people to read. It is never part of `req` or `ctx`, so it never reaches the model.
 * @param {string} name  The file name in cases/, without `.json`.
 * @returns {{id: string, tier: 'clear'|'hard', purpose: string, item: string, outside: boolean, reason: string|null, req: object, ctx: object}[]}
 */
export function loadCaseSet(name) {
  const set = JSON.parse(readFileSync(new URL(`${name}.json`, CASES_DIR), 'utf8'));
  const cases = [];
  for (const m of set.mandates) {
    for (const it of m.items) {
      if (it.label !== 'inside' && it.label !== 'outside') throw new Error(`${name}: "${it.item}" has label ${JSON.stringify(it.label)}`);
      for (const p of it.payments) {
        cases.push({
          id: p.id,
          tier: it.tier,
          purpose: m.purpose,
          item: it.item,
          outside: it.label === 'outside',
          reason: it.reason ?? null,
          req: {
            intentId: p.id, isAgent: true, amount: p.amount, category: m.category, itemDescription: it.item,
            mandate: { purpose: m.purpose, maxPerTxn: m.maxPerTxn, maxTotal: m.maxTotal },
          },
          ctx: { ...set.context, unattended: m.unattended },
        });
      }
    }
  }
  return cases;
}

/** The frozen baseline: the 234 payments behind every headline figure. */
export function labelledCases() {
  return loadCaseSet('baseline');
}
