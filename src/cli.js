#!/usr/bin/env node
// node src/cli.js <trace|sim|ablation|decision|measure|receipt|claims|value|report|demo>

import { headline, trace, ablation, decisionExperiment, skillSweep, guarantee } from './sim/scenarios.js';
import { buildSurface } from './value/surface.js';
import { monteCarlo, sequence, sensitivity, breakeven } from './value/model.js';
import { BETS, BET_KEYS, CONTROLS } from './assumptions.js';
import { FAILURE_MODES } from './sim/failure-modes.js';

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const money = (x) => `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(1)}m`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const rule = (title) => console.log(`\n${title}\n${'-'.repeat(title.length)}`);

function cmdTrace() {
  rule('One payment, two gateways');
  console.log('An agent pays $23.40 for an EV charging session. The issuer charges the card');
  console.log('but the response is lost. The agent retries with a fresh idempotency key.\n');
  for (const run of trace()) {
    console.log(`  ${run.label}`);
    for (const s of run.steps) {
      console.log(`    attempt ${s.attempt}  key=${pad(s.key, 6)} -> ${pad(s.status, 9)} ${s.reason}`);
    }
    console.log(`    card charged ${run.charges}x, issuer called ${run.issuerCalls}x\n`);
  }
}

function cmdSim() {
  rule('Agent traffic against the gateway (30% agent share, tickets at 0.6x)');
  const h = headline();
  for (const [segment, runs] of Object.entries(h)) {
    console.log(`\n  ${segment}`);
    console.log(`    ${pad('', 22)}${lpad('net/1k intents', 15)}${lpad('agent completion', 18)}${lpad('dispute ratio', 15)}${lpad('duplicates', 12)}${lpad('cliff hit', 11)}`);
    const rows = [['humans only (today)', runs.human], ['agents, no changes', runs.naive], ['rails only', runs.railsOnly], ['rails+mandate+storm', runs.core], ['all four bets', runs.full]];
    for (const [label, r] of rows) {
      console.log(`    ${pad(label, 22)}${lpad(`$${(r.perIntent.gatewayNet * 1000).toFixed(0)}`, 15)}${lpad(label.startsWith('humans') ? '-' : pct(r.honestAgentCompletion), 18)}${lpad(pct(r.disputeRatio, 2), 15)}${lpad(pct(r.duplicateRate, 2), 12)}${lpad(pct(r.cliffShare, 0), 11)}`);
    }
    const modes = Object.entries(runs.naive.modes)
      .map(([k, m]) => [k, m.gateway + m.merchant + m.opportunity])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    console.log('    costliest failure modes with no changes (per 1k intents):');
    for (const [k, v] of modes) console.log(`      ${FAILURE_MODES[k].id} ${pad(FAILURE_MODES[k].name, 34)} $${((v / 12000) * 1000).toFixed(0)}`);
  }
}

function valuation({ quiet = false } = {}) {
  if (!quiet) process.stdout.write('  simulating response surface ');
  const surface = buildSurface({
    onProgress: (d, t) => !quiet && d % 4 === 0 && process.stdout.write(d === t ? '. done\n' : '.'),
  });
  const mc = monteCarlo(surface);
  return { surface, mc };
}

function cmdValue() {
  rule('Value of every combination of bets, against doing nothing');
  const { surface, mc } = valuation();
  console.log(`\n  ${mc.draws} worlds. NZ$m over 5 years, per 100M baseline transactions a year in each segment.\n`);
  console.log(`    ${pad('portfolio', 30)}${lpad("value", 9)}${lpad('p05', 9)}${lpad('p95', 9)}${lpad('P(loss)', 9)}${lpad('P(best)', 9)}${lpad('plain EV', 10)}`);
  for (const p of [...mc.portfolios].sort((a, b) => b.mean - a.mean)) {
    console.log(`    ${pad(p.key, 30)}${lpad(money(p.mean), 9)}${lpad(money(p.p05), 9)}${lpad(money(p.p95), 9)}${lpad(pct(p.pLoss, 0), 9)}${lpad(pct(p.pBest, 0), 9)}${lpad(money(p.plainMean), 10)}`);
  }
  rule('Build order (largest marginal value first)');
  for (const s of sequence(mc)) {
    console.log(`    ${pad(BETS[s.bet].label, 20)} marginal ${lpad(money(s.marginal), 8)}   cumulative ${lpad(money(s.cumulative), 8)}   P(loss) ${pct(s.pLoss, 0)}`);
  }
  rule('What to find out first (rails+mandate+storm, p10 to p90 of each prior)');
  const sens = sensitivity(surface, ['rails', 'mandate', 'storm']);
  for (const r of sens.rows.slice(0, 6)) {
    console.log(`    ${pad(r.key, 26)} ${lpad(money(r.lo), 8)} to ${lpad(money(r.hi), 8)}`);
  }
  const be = breakeven(surface, BET_KEYS, ['rails', 'mandate', 'storm'], 'elasticity.unattended');
  rule('When micro-settlement becomes worth building');
  console.log(be.value === null
    ? '    Not within the prior range for unattended elasticity.'
    : `    When unattended elasticity exceeds ${be.value.toFixed(2)} (prior mode ${be.mode}).`);
}

function cmdDecision() {
  rule('Jev as the decision model: what happens when it fails, with and without its guard');
  console.log('  Recommended stack, 30% agent share. Simulated stand-in for Jev; see src/decision/simulated.js.\n');
  console.log(`    ${pad('', 50)}${lpad('gateway net/1k', 15)}${lpad('merchant loss/1k', 18)}${lpad('agent completion', 18)}${lpad('fallback', 10)}`);
  let group = null;
  for (const r of decisionExperiment()) {
    if (r.group !== group) console.log(`  ${(group = r.group)}`);
    console.log(`    ${pad(r.label, 50)}${lpad(`$${r.net.toFixed(1)}`, 15)}${lpad(`$${r.merchantLoss.toFixed(1)}`, 18)}${lpad(pct(r.completion), 18)}${lpad(pct(r.fallbackShare), 10)}`);
  }
  rule('How good does it have to be? (separation 1.6 ~ AUC 0.87, 2.2 ~ 0.94, 3.0 ~ 0.98)');
  for (const r of skillSweep()) {
    console.log(`    separation ${r.separation.toFixed(1)}   gateway net/1k $${r.net.toFixed(1)}   merchant loss/1k $${r.merchantLoss.toFixed(1)}`);
  }
}

async function cmdReceipt() {
  rule('A conformance receipt');
  const { createGatewayKey, issueReceipt, verifyReceipt, receiptLeaf } = await import('./receipt/receipt.js');
  const { ReceiptLog, verifyInclusion } = await import('./receipt/log.js');
  const { buildDecisionRequest } = await import('./decision/request.js');
  const { labelledCases } = await import('./decision/cases.js');
  const c = labelledCases().find((x) => x.id === 'hard-0-out-0-1');
  const wire = buildDecisionRequest(c.req, c.ctx).wire;
  const mandate = { id: 'mandate-7731', signature: 'ZXhhbXBsZS1zaWduYXR1cmU=' };
  const key = createGatewayKey();
  const log = new ReceiptLog();
  for (let i = 0; i < 1000; i++) log.append(`earlier-receipt-${i}`);
  const receipt = issueReceipt({
    key, paymentId: 'pay_8841#0', issuedAt: 1794800000, wire, mandate,
    answer: { stated: { unauthorised: 0.04, outside_mandate: 0.92 }, p: { unauthorised: 0.02, outside_mandate: 0.97 }, version: wire.model },
    decision: { action: 'decline', ev: { approve: -121.84, stepUp: -10.09, decline: 0 } },
  });
  const index = log.append(receiptLeaf(receipt));
  for (let i = 0; i < 500; i++) log.append(`later-receipt-${i}`);
  const root = log.root();
  console.log(`  ${c.req.mandate.purpose} -> ${c.item}, $${c.req.amount}`);
  console.log(`  model ${receipt.model}   said ${receipt.stated.outside_mandate} outside the mandate   action ${receipt.action}`);
  console.log(`  state hash ${receipt.stateHash.slice(0, 16)}...   signature ${receipt.signature.slice(0, 16)}...`);
  console.log(`\n  verify with the public key only:           ${JSON.stringify(verifyReceipt(receipt, key.publicKeyPem))}`);
  console.log(`  verify with the state revealed:            ${JSON.stringify(verifyReceipt(receipt, key.publicKeyPem, { wire, mandate }))}`);
  console.log(`  change the action to "approve":            ${JSON.stringify(verifyReceipt({ ...receipt, action: 'approve' }, key.publicKeyPem))}`);
  const edited = { ...wire, state: { ...wire.state, item: { description: 'groceries' } } };
  console.log(`  reveal a different item than was asked:    ${JSON.stringify(verifyReceipt(receipt, key.publicKeyPem, { wire: edited }))}`);
  const proof = log.proof(index);
  console.log(`\n  in a log of ${log.size} receipts, the proof is ${proof.length} hashes`);
  console.log(`  published root ${root.slice(0, 16)}...   inclusion ${verifyInclusion(receiptLeaf(receipt), proof, root)}`);
  console.log(`  a receipt written after the fact:          inclusion ${verifyInclusion(receiptLeaf({ ...receipt, action: 'approve' }), proof, root)}`);
}

function cmdClaims() {
  rule('Agent-dispute claims, basis points of agent volume');
  console.log('  Merchant losses from disputes about authorisation or scope.\n');
  for (const r of guarantee()) console.log(`    ${pad(r.label, 36)} ${lpad(r.claimsBps.toFixed(0), 5)} bps`);
}

async function cmdMeasure() {
  rule('Measure the real Jev');
  const { JevClient } = await import('./decision/jev-client.js');
  const { labelledCases } = await import('./decision/cases.js');
  const { measure, saveMeasured, MEASURED_PATH } = await import('./decision/measure.js');
  let client;
  try {
    client = new JevClient();
  } catch {
    console.log('  TYPESAFE_API_KEY is not set, so Jev cannot be called.');
    console.log('  Get a key at console.typesafe.ai/keys, export it, and run this again.');
    console.log('  Until then every simulation uses the priors in src/decision/simulated.js.');
    process.exitCode = 1;
    return;
  }
  const cases = labelledCases();
  console.log(`  sending ${cases.length} labelled payments to Jev ...`);
  const m = await measure({ client, cases });
  if (!m.ok) {
    console.log(`  could not measure: ${m.reason}. Answered ${m.answered} of ${m.asked}. Errors: ${JSON.stringify(m.errors)}`);
    process.exitCode = 1;
    return;
  }
  saveMeasured(m);
  console.log(`  answered ${m.answered} of ${m.asked}; versions ${JSON.stringify(m.versions)}`);
  for (const [tier, q] of Object.entries(m.byTier)) {
    console.log(`  ${pad(tier, 6)} n=${q.n}  AUC ${q.auc.toFixed(3)}  calibration error ${(q.ece * 100).toFixed(1)}%`);
  }
  console.log(`  overall AUC ${m.quality.auc.toFixed(3)}${m.quality.atCeiling ? ' (at ceiling: cases too easy to rank the model)' : ''}   Platt slope ${m.quality.calibrationIdentifiable ? m.quality.plattSlope.toFixed(2) : 'not identifiable'}`);
  console.log(`  latency median ${m.latency.medianMs.toFixed(0)}ms, p95 ${m.latency.p95Ms.toFixed(0)}ms, ${pct(m.latency.withinGatewayDeadline)} inside the 400ms deadline`);
  console.log(`  wrote ${MEASURED_PATH}`);
  console.log('  The simulator now uses these in place of its priors. Run: npm run report');
}

async function cmdReport() {
  const { buildReport } = await import('./report/build.js');
  await buildReport({ log: (m) => console.log(`  ${m}`) });
}

function cmdAblation() {
  rule('Remove one control from the full stack (per 1k intents)');
  const a = ablation();
  for (const [segment, rows] of Object.entries(a)) {
    console.log(`\n  ${segment}`);
    for (const r of [...rows].sort((x, y) => x.netDelta - y.netDelta)) {
      console.log(`    without ${pad(r.control, 20)} gateway ${lpad(`$${(r.netDelta * 1000).toFixed(1)}`, 8)}  merchants ${lpad(`$${(-r.merchantLossDelta * 1000).toFixed(1)}`, 8)}  ${CONTROLS[r.control]}`);
    }
  }
}

const cmd = process.argv[2] ?? 'demo';
const commands = {
  trace: cmdTrace,
  sim: cmdSim,
  ablation: cmdAblation,
  value: cmdValue,
  decision: cmdDecision,
  measure: cmdMeasure,
  receipt: cmdReceipt,
  claims: cmdClaims,
  report: cmdReport,
  demo: () => {
    cmdTrace();
    cmdSim();
    cmdDecision();
    cmdValue();
  },
};
if (!commands[cmd]) {
  console.error(`unknown command "${cmd}". Try: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
await commands[cmd]();
