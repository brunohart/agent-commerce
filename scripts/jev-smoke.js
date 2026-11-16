// Live check of the Jev client against TypeSafe's API. Not part of `npm test`,
// which stays offline. Run it on a machine that can reach api.typesafe.ai:
//
//   TYPESAFE_API_KEY=... npm run jev:smoke
//
// It lists the models the key can use, then sends the same "gift card on a grocery
// mandate" payment the report uses, on the pinned model, and prints what came back.
// A pass means the wire shape, auth, version pin and answer parsing all hold for
// real. The key is never printed.

import { JevClient } from '../src/decision/jev-client.js';
import { buildDecisionRequest, PINNED_MODEL } from '../src/decision/request.js';

const DEADLINE_MS = Number(process.env.JEV_SMOKE_DEADLINE_MS ?? 5000); // generous: first call pays for TLS

const payment = {
  intentId: 'smoke-1',
  amount: 50,
  category: 'grocery',
  itemDescription: 'store gift card',
  mandate: { id: 'm-smoke', purpose: 'the weekly household shop', maxPerTxn: 510, maxTotal: 1200 },
};
const ctx = { attested: true, mandateVerified: true, spent: 222.4, unattended: false };

let client;
try {
  client = new JevClient();
} catch (err) {
  console.error(`✗ ${err.message}. Create a key in the TypeSafe console and export it.`);
  process.exit(2);
}

console.log(`endpoint  ${client.endpoint}`);

try {
  const models = await client.listModels();
  console.log(`models    ${models.join(', ') || '(none listed)'}`);
  if (models.length && !models.includes(PINNED_MODEL)) {
    console.warn(`!         pinned model ${PINNED_MODEL} is not in that list; update PINNED_MODEL in src/decision/request.js`);
  }
} catch (err) {
  console.warn(`!         ${err.message} (continuing to the decision call)`);
}

const request = buildDecisionRequest(payment, ctx);
const out = await client.decide(request, DEADLINE_MS);

if (!out.ok) {
  console.error(`✗ no answer: ${out.error} after ${Math.round(out.latencyMs)} ms`);
  if (out.error === 'http_401') console.error('  The key was rejected.');
  if (out.error === 'http_422') console.error('  Validation error: the request shape no longer matches the API.');
  if (out.error === 'malformed_answer') console.error('  The call worked but the answers did not parse; check parseAnswers().');
  process.exit(1);
}

console.log(`version   ${out.version}${out.version === PINNED_MODEL ? '' : `  (expected ${PINNED_MODEL})`}`);
console.log(`latency   ${Math.round(out.latencyMs)} ms`);
for (const [q, p] of Object.entries(out.p)) console.log(`${q.padEnd(16)}  ${p.toFixed(3)}`);
console.log(
  out.p.outside_mandate > 0.5
    ? '✓ live call works, and Jev flags the gift card as outside the grocery mandate'
    : '✓ live call works. Note: Jev did not flag the gift card as outside the mandate; worth a look',
);
