// The report page. Pure function of the results: no dates, no randomness, so the
// same results always render the same bytes.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
// Probabilities: never round a small non-zero chance down to nothing.
const prob = (x) => (x > 0 && x < 0.01 ? '<1%' : x > 0.99 && x < 1 ? '>99%' : pct(x));
const niceMax = (v) => {
  for (const step of [0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.25]) if (step * 4 >= v) return step * 4;
  return v;
};
const money = (x, d = 1) => `${x < 0 ? '\u2212\u2060' : '+'}$${Math.abs(x).toFixed(d)}m`;
const dollars2 = (x) => `${x < 0 ? '\u2212\u2060' : x > 0 ? '+' : ''}$${Math.abs(x).toFixed(2)}`;
const dollars = (x) => `${x < 0 ? '\u2212\u2060' : ''}$${Math.abs(x).toFixed(0)}`;
const lin = (d0, d1, r0, r1) => (x) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
// AUC implied by a separation d between two unit normals: Phi(d / sqrt(2)).
const auc = (d) => {
  const z = d / Math.SQRT2 / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + erf);
};

const PRIOR_LABEL = {
  'agentShare.online': ['Agent share of online purchases', 'pct'],
  'agentShare.unattended': ['Agent share of unattended purchases', 'pct'],
  'frictionRatio.online': ['Friction left once an agent buys (online)', 'x'],
  'frictionRatio.unattended': ['Friction left once an agent buys (unattended)', 'x'],
  'elasticity.online': ['Volume elasticity (online)', 'n'],
  'elasticity.unattended': ['Volume elasticity (unattended)', 'n'],
  'fragmentation.online': ['Ticket fragmentation (online)', 'pct'],
  'fragmentation.unattended': ['Ticket fragmentation (unattended)', 'pct'],
  erosion: ['Volume lost if not agent-ready', 'n'],
  churnSensitivity: ['Merchant churn per unit of loss', 'n'],
  discountRate: ['Discount rate', 'pct'],
  rampMidpointYear: ['Year adoption reaches halfway', 'yr'],
};
const priorLabel = (key, BETS) => {
  if (PRIOR_LABEL[key]) return PRIOR_LABEL[key];
  const [kind, bet] = key.split('.');
  return [`${kind === 'buildCost' ? 'Build cost' : 'Run cost'}: ${BETS[bet].label}`, 'cost'];
};
const fmtInput = (v, kind) =>
  kind === 'pct' ? pct(v) : kind === 'x' ? `${v.toFixed(2)}×` : kind === 'yr' ? `yr ${v.toFixed(1)}` : kind === 'cost' ? `$${v.toFixed(1)}m` : v.toFixed(2);

const CONFIG = {
  naive: { label: 'Today’s gateway', cls: 's1' },
  railsOnly: { label: 'Rails only', cls: 's2' },
  core: { label: 'Rails + mandate + storm', cls: 's3' },
};

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function lineChart({ id, series, yFmt, yMax, threshold, xLabel }) {
  const W = 520;
  const H = 280;
  const m = { l: 46, r: 164, t: 14, b: 40 };
  const xs = series[0].points.map((p) => p.x);
  const x = lin(0, Math.max(...xs), m.l, W - m.r);
  const y = lin(0, yMax, H - m.b, m.t);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  let g = '';
  for (const t of yTicks) {
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    g += `<text class="tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`;
  }
  for (const t of [0.01, 0.02, 0.04, 0.06]) {
    g += `<text class="tick" x="${x(t)}" y="${H - m.b + 16}" text-anchor="middle">${pct(t)}</text>`;
  }
  g += `<text class="tick" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(xLabel)}</text>`;
  if (threshold) {
    g += `<line class="threshold" x1="${m.l}" x2="${W - m.r}" y1="${y(threshold.value)}" y2="${y(threshold.value)}"/>`;
  }
  // End labels, pushed apart so they never overlap.
  const ends = series
    .map((s) => ({ s, y: y(Math.min(yMax, s.points.at(-1).y)) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  for (const s of series) {
    const pts = s.points.map((p) => `${x(p.x).toFixed(1)},${y(Math.min(yMax, p.y)).toFixed(1)}`).join(' ');
    g += `<polyline class="line ${s.cls}" points="${pts}"/>`;
    for (const p of s.points) {
      g += `<circle class="dot ${s.cls}" cx="${x(p.x).toFixed(1)}" cy="${y(Math.min(yMax, p.y)).toFixed(1)}" r="4" tabindex="0" data-tip="${esc(`${s.label}\n${yFmt(p.y, true)} at ${pct(p.x, 1)} base timeout rate`)}"/>`;
    }
  }
  for (const e of ends) {
    g += `<text class="endlabel" x="${W - m.r + 10}" y="${e.y + 4}">${esc(e.s.short ?? e.s.label)}</text>`;
  }
  return `<div class="scroll"><svg id="${id}" class="chart" viewBox="0 0 ${W} ${H}" style="min-width:440px" role="img" aria-label="${esc(xLabel)}">${g}</svg></div>`;
}

function valueChart({ ranked, BETS, BET_KEYS, best }) {
  const W = 900;
  const rowH = 28;
  const top = 46;
  const H = top + ranked.length * rowH + 40;
  const colW = 50;
  const plotL = 236;
  const plotR = 716;
  const lo = Math.floor(Math.min(...ranked.map((p) => p.p05)) / 5) * 5;
  const hi = Math.ceil(Math.max(...ranked.map((p) => p.p95)) / 5) * 5;
  const x = lin(lo, hi, plotL, plotR);
  let g = '';
  BET_KEYS.forEach((b, i) => {
    g += `<text class="colhead" x="${24 + i * colW}" y="26" text-anchor="middle">${esc(BETS[b].short)}</text>`;
  });
  g += `<text class="colhead" x="${(plotL + plotR) / 2}" y="26" text-anchor="middle">Value against doing nothing (NZ$m)</text>`;
  g += `<text class="colhead" x="772" y="26" text-anchor="end">P(loss)</text>`;
  g += `<text class="colhead" x="862" y="26" text-anchor="end">P(best)</text>`;
  const step = hi - lo > 40 ? 10 : 5;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    g += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 34}"/>`;
    g += `<text class="tick" x="${x(t)}" y="${H - 16}" text-anchor="middle">${t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t)}</text>`;
  }
  ranked.forEach((p, r) => {
    const cy = top + r * rowH + rowH / 2;
    const isBest = p.key === best;
    const tip = p.bets.length
      ? `${p.bets.map((b) => BETS[b].label).join(' + ')}\nValue ${money(p.mean)} (5th–95th: ${money(p.p05)} to ${money(p.p95)})\nPlain EV ${money(p.plainMean)}\nLoses money in ${prob(p.pLoss)} of worlds, best choice in ${prob(p.pBest)}`
      : 'Do nothing\nThe reference every other row is measured against.';
    g += `<g class="row${isBest ? ' best' : ''}" tabindex="0" data-tip="${esc(tip)}">`;
    g += `<rect class="rowbg" x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}"/>`;
    BET_KEYS.forEach((b, i) => {
      g += `<circle class="${p.bets.includes(b) ? 'on' : 'off'}" cx="${24 + i * colW}" cy="${cy}" r="${p.bets.includes(b) ? 6 : 3}"/>`;
    });
    if (p.bets.length) {
      g += `<line class="whisker" x1="${x(p.p05)}" x2="${x(p.p95)}" y1="${cy}" y2="${cy}"/>`;
      g += `<rect class="box" x="${x(p.p25)}" y="${cy - 4}" width="${Math.max(2, x(p.p75) - x(p.p25))}" height="8" rx="4"/>`;
      const px = x(p.plainMean);
      g += `<path class="plain" d="M${px} ${cy - 6} L${px + 5} ${cy} L${px} ${cy + 6} L${px - 5} ${cy} Z"/>`;
      g += `<circle class="mean" cx="${x(p.mean)}" cy="${cy}" r="5"/>`;
      g += `<text class="val" x="772" y="${cy + 4}" text-anchor="end">${prob(p.pLoss)}</text>`;
      g += `<text class="val" x="862" y="${cy + 4}" text-anchor="end">${prob(p.pBest)}</text>`;
    } else {
      g += `<text class="tick" x="${x(0) + 8}" y="${cy + 4}">do nothing</text>`;
    }
    g += '</g>';
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:720px" role="img" aria-label="Value of all sixteen combinations of bets">${g}</svg>`;
}

function tornado({ sens, BETS }) {
  const rows = sens.rows.slice(0, 8);
  const W = 900;
  const rowH = 32;
  const top = 12;
  const H = top + rows.length * rowH + 38;
  const plotL = 330;
  const plotR = 800;
  const all = rows.flatMap((r) => [r.lo, r.hi]).concat(sens.base);
  const lo = Math.floor(Math.min(...all) / 2) * 2;
  const hi = Math.ceil(Math.max(...all) / 2) * 2;
  const x = lin(lo, hi, plotL, plotR);
  let g = '';
  const step = hi - lo > 24 ? 5 : 2;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    g += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${H - 34}"/>`;
    g += `<text class="tick" x="${x(t)}" y="${H - 16}" text-anchor="middle">${t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t)}</text>`;
  }
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const [label, kind] = priorLabel(r.key, BETS);
    const a = Math.min(r.lo, r.hi);
    const b = Math.max(r.lo, r.hi);
    const loLeft = r.lo <= r.hi;
    const tip = `${label}\nAt ${fmtInput(r.p10, kind)}: ${money(r.lo)}\nAt ${fmtInput(r.p90, kind)}: ${money(r.hi)}`;
    g += `<g class="row" tabindex="0" data-tip="${esc(tip)}">`;
    g += `<rect class="rowbg" x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}"/>`;
    g += `<text class="rowlabel" x="${plotL - 56}" y="${cy + 4}" text-anchor="end">${esc(label)}</text>`;
    g += `<rect class="box" x="${x(a)}" y="${cy - 6}" width="${Math.max(2, x(b) - x(a))}" height="12" rx="4"/>`;
    g += `<text class="tick" x="${x(a) - 6}" y="${cy + 4}" text-anchor="end">${fmtInput(loLeft ? r.p10 : r.p90, kind)}</text>`;
    g += `<text class="tick" x="${x(b) + 6}" y="${cy + 4}">${fmtInput(loLeft ? r.p90 : r.p10, kind)}</text>`;
    g += '</g>';
  });
  g += `<line class="base" x1="${x(sens.base)}" x2="${x(sens.base)}" y1="${top - 4}" y2="${H - 34}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:680px" role="img" aria-label="Sensitivity of the decision to each prior">${g}</svg>`;
}

function breakevenChart(be) {
  const W = 470;
  const H = 230;
  const m = { l: 46, r: 24, t: 16, b: 40 };
  const ys = be.curve.map((p) => p.gap);
  const yLo = Math.floor(Math.min(...ys, 0));
  const yHi = Math.ceil(Math.max(...ys, 0));
  const x = lin(be.range[0], be.range[1], m.l, W - m.r);
  const y = lin(yLo, yHi, H - m.b, m.t);
  let g = '';
  for (let t = yLo; t <= yHi; t += Math.max(1, Math.round((yHi - yLo) / 4))) {
    g += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    g += `<text class="tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t)}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const v = be.range[0] + ((be.range[1] - be.range[0]) * i) / 4;
    g += `<text class="tick" x="${x(v)}" y="${H - m.b + 16}" text-anchor="middle">${v.toFixed(2)}</text>`;
  }
  g += `<text class="tick" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">Unattended volume elasticity</text>`;
  g += `<polyline class="line s1" points="${be.curve.map((p) => `${x(p.value).toFixed(1)},${y(p.gap).toFixed(1)}`).join(' ')}"/>`;
  g += `<line class="base" x1="${x(be.mode)}" x2="${x(be.mode)}" y1="${m.t}" y2="${H - m.b}"/>`;
  g += `<text class="tick" x="${x(be.mode) + 6}" y="${m.t + 10}">prior mode ${be.mode}</text>`;
  if (be.value !== null) {
    g += `<circle class="dot s1" cx="${x(be.value)}" cy="${y(0)}" r="5" tabindex="0" data-tip="${esc(`Break-even\nMicro-settlement pays above an elasticity of ${be.value.toFixed(2)}`)}"/>`;
    const right = x(be.value) > W - 130;
    g += `<text class="endlabel" x="${x(be.value) + (right ? -8 : 8)}" y="${y(0) - 10}" text-anchor="${right ? 'end' : 'start'}">break-even ${be.value.toFixed(2)}</text>`;
  }
  return `<div class="scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:400px" role="img" aria-label="Marginal value of micro-settlement by elasticity">${g}</svg></div>`;
}

// One dot per borderline purchase: where Jev put it, against where I labelled it.
function dotPlot(examples) {
  const W = 900;
  const H = 230;
  const x = lin(0, 1, 200, 870);
  const rows = [[false, 70, 's1', 'I labelled it inside'], [true, 150, 's2', 'I labelled it outside']];
  let g = '';
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    g += `<line class="${t === 0.5 ? 'zero' : 'grid'}" x1="${x(t)}" x2="${x(t)}" y1="24" y2="${H - 44}"/>`;
    g += `<text class="tick" x="${x(t)}" y="${H - 26}" text-anchor="middle">${pct(t)}</text>`;
  }
  g += `<text class="tick" x="${x(0.5)}" y="${H - 6}" text-anchor="middle">Jev’s probability that the item is outside the mandate</text>`;
  for (const [outside, cy, cls, label] of rows) {
    g += `<text class="rowlabel" x="186" y="${cy + 4}" text-anchor="end">${esc(label)}</text>`;
    const placed = [];
    for (const e of examples.filter((d) => d.outside === outside).sort((a, b) => a.jev - b.jev)) {
      const px = x(e.jev);
      let level = 0;
      while (placed.some((p) => p.level === level && Math.abs(p.px - px) < 11)) level++;
      placed.push({ px, level });
      const py = cy + (level % 2 ? 1 : -1) * Math.ceil(level / 2) * 11;
      g += `<circle class="dot ${cls}" cx="${px.toFixed(1)}" cy="${py}" r="5" tabindex="0" data-tip="${esc(`${e.item}\nMandate: ${e.purpose}\nJev: ${pct(e.jev)} outside`)}"/>`;
    }
  }
  return `<div class="scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:640px" role="img" aria-label="Jev's probability for each borderline purchase">${g}</svg></div>`;
}

function measuredBlock(m) {
  const { hard, clear } = m.byTier;
  const missed = m.examples.filter((e) => e.jev > 0.5 !== e.outside);
  const slope = m.quality.plattSlope;
  return `<h2>Measured on the real model</h2>
  <p>${m.answered} labelled payments were sent to Jev (${esc(Object.keys(m.versions).join(', '))}) through the same client and the same two questions the pipeline uses. ${clear.n} are clear-cut. ${hard.n} are borderline, where the item sits near the edge of what the mandate describes.</p>
  <div class="stats">
    <div class="stat"><b>${hard.auc.toFixed(3)}</b><span>AUC on the ${hard.n} borderline payments</span></div>
    <div class="stat"><b>${clear.auc.toFixed(3)}</b><span>AUC on the ${clear.n} clear-cut payments</span></div>
    <div class="stat"><b>${Math.round(m.latency.medianMs)}ms</b><span>Median latency. ${pct(m.latency.withinGatewayDeadline)} answered inside the 400ms deadline</span></div>
    <div class="stat"><b>${m.answered}/${m.asked}</b><span>Calls answered, with no errors</span></div>
  </div>
  <div class="figure"><h3>What Jev said about each borderline purchase</h3>
    ${`<div class="legend"><span><i class="swatch k-dot s1"></i>I labelled it inside the mandate</span><span><i class="swatch k-dot s2"></i>I labelled it outside</span></div>`}
    ${dotPlot(m.examples)}
    <details><summary>Table view</summary><div class="scroll"><table><thead><tr><th>Mandate</th><th>Item</th><th>My label</th><th class="num">Jev: outside</th></tr></thead><tbody>${[...m.examples].sort((a, b) => a.jev - b.jev).map((e) => `<tr><td>${esc(e.purpose)}</td><th scope="row">${esc(e.item)}</th><td>${e.outside ? 'outside' : 'inside'}</td><td class="num">${pct(e.jev)}</td></tr>`).join('')}</tbody></table></div></details>
  </div>
  <p>Jev and I disagree on ${missed.length} of the ${m.examples.length} borderline items: ${missed.map((e) => `${esc(e.item)} (${pct(e.jev)})`).join('; ')}. On at least one of those I think Jev has the better argument, which is the nature of a borderline label.</p>
  <p>${m.quality.calibrationIdentifiable ? (slope > 1 ? `Its probabilities are underconfident on this set: they sit closer to 50% than the outcomes justify, by a factor of about ${slope.toFixed(1)} on the log-odds scale. That is the opposite of the failure I had built a test for, and it matters for the same reason: the gateway uses the number as a number. The guard’s recalibration is what corrects it.` : `Its probabilities are overconfident on this set by a factor of about ${(1 / slope).toFixed(1)} on the log-odds scale. The guard’s recalibration is what corrects it.`) : 'The two groups do not overlap, so calibration cannot be fitted from this set.'}</p>`;
}

function skillChart({ skill, staticLoss }) {
  const W = 520;
  const H = 250;
  const m = { l: 50, r: 150, t: 16, b: 52 };
  const xs = skill.map((p) => p.separation);
  const ys = skill.map((p) => p.merchantLoss).concat(staticLoss);
  const yLo = Math.floor(Math.min(...ys) / 10) * 10 - 10;
  const yHi = Math.ceil(Math.max(...ys) / 10) * 10;
  const x = lin(xs[0], xs.at(-1), m.l, W - m.r);
  const y = lin(yLo, yHi, H - m.b, m.t);
  let g = '';
  for (let t = yLo; t <= yHi; t += 10) {
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    g += `<text class="tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">$${t}</text>`;
  }
  for (const p of skill) {
    g += `<text class="tick" x="${x(p.separation)}" y="${H - m.b + 16}" text-anchor="middle">${auc(p.separation).toFixed(2)}</text>`;
  }
  g += `<text class="tick" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Decision model skill (AUC)</text>`;
  g += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(staticLoss)}" y2="${y(staticLoss)}"/>`;
  g += `<text class="endlabel" x="${W - m.r + 10}" y="${y(staticLoss) + 4}">Static rule</text>`;
  g += `<polyline class="line s1" points="${skill.map((p) => `${x(p.separation).toFixed(1)},${y(p.merchantLoss).toFixed(1)}`).join(' ')}"/>`;
  for (const p of skill) {
    g += `<circle class="dot s1" cx="${x(p.separation).toFixed(1)}" cy="${y(p.merchantLoss).toFixed(1)}" r="4" tabindex="0" data-tip="${esc(`AUC ${auc(p.separation).toFixed(2)}\nMerchant loss $${p.merchantLoss.toFixed(0)} per 1,000 intents\nGateway net $${p.net.toFixed(0)}`)}"/>`;
  }
  const last = skill.at(-1);
  g += `<text class="endlabel" x="${W - m.r + 10}" y="${y(last.merchantLoss) + 4}">With the decision model</text>`;
  return `<div class="scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:440px" role="img" aria-label="Merchant loss by decision model skill">${g}</svg></div>`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const STAGES = [
  ['Protocol', 'Does the gateway speak this agent’s dialect?', ['protocol_fragmentation']],
  ['Attestation', 'Is this really the cardholder’s agent?', ['impersonation']],
  ['Idempotency', 'Have we seen this purchase before?', ['duplicate_charge', 'double_fire']],
  ['Mandate', 'Did the human authorise this?', ['mandate_drift', 'overspend', 'stale_mandate']],
  ['Decision', 'How likely is it the cardholder stands behind this?', ['false_decline', 'miscalibration', 'decision_unavailable', 'version_drift', 'state_injection', 'selective_labels']],
  ['Authentication', 'Can anyone answer a challenge?', ['sca_no_human']],
  ['Issuer', 'Did the card get charged?', ['issuer_timeout', 'retry_storm']],
  ['Settlement', 'Does the money add up, at this ticket size?', ['micro_burden', 'settle_fail', 'service_before_auth']],
  ['Dispute', 'Who pays when the human says no?', ['friendly_fraud', 'monitoring_cliff']],
];

export function renderPage({ results, BETS, BET_KEYS, CONTROLS, FAILURE_MODES }) {
  const { value, headline, brownout, ablation, modeCost, trace, meta, decision, thesis } = results;
  const usd = (v) => (v >= 1e9 ? `US$${(v / 1e9).toFixed(1)}bn` : `US$${(v / 1e6).toFixed(0)}m`);
  const claimMax = Math.max(...thesis.guarantee.map((g) => g.claimsBps));
  const exp = Object.fromEntries(decision.experiment.map((r) => [r.key, r]));
  const ex = decision.example;
  const groups = [...new Set(decision.experiment.map((r) => r.group))];
  const best = value.ranked.find((p) => p.key === value.best);
  const byKey = Object.fromEntries(value.ranked.map((p) => [p.key, p]));
  const railsOnly = byKey.rails;
  const full = byKey[BET_KEYS.join('+')];
  const bestLabel = best.bets.map((b) => BETS[b].label).join(' + ');
  const order = value.sequence.filter((s) => best.bets.includes(s.bet));
  const be = value.microBreakeven;
  const betOf = (control) => BET_KEYS.find((b) => BETS[b].controls.includes(control));
  const synergy = (a, b) => value.interactions.find((i) => (i.a === a && i.b === b) || (i.a === b && i.b === a)).synergy;

  const series = (field) =>
    Object.entries(CONFIG).map(([k, c]) => ({
      ...c,
      short: k === 'core' ? 'Rails + mandate + storm' : c.label,
      points: brownout[k].map((p) => ({ x: p.base, y: p[field] })),
    }));
  const dupMax = niceMax(Math.max(...Object.values(brownout).flatMap((s) => s.map((p) => p.duplicateRate))));
  const dispMax = niceMax(Math.max(...Object.values(brownout).flatMap((s) => s.map((p) => p.disputeRatio))));
  const axisPct = (max) => (v, long) => pct(v, long ? 2 : Number.isInteger(Math.round(max * 2500) / 100) ? 0 : 1);

  const scenarioRows = (seg) => {
    const rows = [['human', 'Humans only (today)'], ['naive', 'Agents arrive, nothing changes'], ['railsOnly', 'Rails only'], ['core', 'Rails + mandate + storm'], ['full', 'All four bets']];
    const max = Math.max(...rows.map(([k]) => headline[seg][k].net));
    return rows
      .map(([k, label]) => {
        const r = headline[seg][k];
        return `<tr><th scope="row">${esc(label)}</th>
          <td><div class="barcell"><div class="track"><span class="bar" style="width:${Math.max(1, (r.net / max) * 100).toFixed(1)}%" tabindex="0" data-tip="${esc(`${label}\nGateway net ${dollars(r.net)} per 1,000 purchase intents`)}"></span></div><span class="num">${dollars(r.net)}</span></div></td>
          <td class="num">${k === 'human' ? '–' : pct(r.completion)}</td>
          <td class="num">${pct(r.disputeRatio, 2)}</td>
          <td class="num">${pct(r.duplicateRate, 2)}</td></tr>`;
      })
      .join('');
  };

  const ablationRows = Object.keys(CONTROLS)
    .map((c) => {
      const on = ablation.online.find((r) => r.control === c);
      const un = ablation.unattended.find((r) => r.control === c);
      return { c, on, un, total: -(on.netDelta + un.netDelta) + on.merchantLossDelta + un.merchantLossDelta };
    })
    .sort((a, b) => b.total - a.total)
    .map(({ c, on, un }) => `<tr><th scope="row">${esc(CONTROLS[c])}<span class="sub">${esc(BETS[betOf(c)].label)}</span></th>
      <td class="num">${dollars(-on.netDelta * 1000)}</td><td class="num">${dollars(on.merchantLossDelta * 1000)}</td>
      <td class="num">${dollars(-un.netDelta * 1000)}</td><td class="num">${dollars(un.merchantLossDelta * 1000)}</td></tr>`)
    .join('');

  const registerRows = Object.entries(FAILURE_MODES)
    .map(([key, m]) => `<tr><td class="mono">${m.id}</td><th scope="row">${esc(m.name)}<span class="sub">${esc(m.layer)}</span></th>
      <td>${esc(m.trigger)}</td>
      <td>${m.mitigatedBy.length ? m.mitigatedBy.map((c) => esc(BETS[betOf(c)].short)).filter((v, i, a) => a.indexOf(v) === i).join(', ') : m.introducedBy ? `None. Introduced by ${esc(BETS[betOf(m.introducedBy)].short)}` : 'None'}</td>
      <td class="num">${dollars(modeCost[key].naive)}</td><td class="num">${dollars(modeCost[key].core)}</td></tr>`)
    .join('');

  const traceBlock = (run) => `<div class="receipt"><div class="receipt-head">${esc(run.label)}</div>
    ${run.steps.map((s) => `<div class="receipt-line"><span>attempt ${s.attempt} · ${esc(s.key)}</span><span>${esc(s.status)}</span></div><div class="receipt-sub">${esc(s.reason)}</div>`).join('')}
    <div class="receipt-total"><span>card charged</span><span class="${run.charges > 1 ? 'bad' : 'good'}">${run.charges}× ${run.charges > 1 ? '⚠' : '✓'}</span></div></div>`;

  const stageCards = STAGES.map(
    ([name, question, modes], i) => `<li class="stage"><div class="stage-n">${String(i + 1).padStart(2, '0')}</div><div class="stage-name">${esc(name)}</div><div class="stage-q">${esc(question)}</div>
      <ul class="modes">${modes.map((k) => `<li tabindex="0" data-tip="${esc(`${FAILURE_MODES[k].id} ${FAILURE_MODES[k].name}\n${FAILURE_MODES[k].trigger}\n${FAILURE_MODES[k].effect}`)}"><span class="mono">${FAILURE_MODES[k].id}</span> ${esc(FAILURE_MODES[k].name)}</li>`).join('')}</ul></li>`,
  ).join('');

  const legend = (items) => `<div class="legend">${items.map(([cls, label]) => `<span><i class="swatch ${cls}"></i>${esc(label)}</span>`).join('')}</div>`;

  return `<title>Jev at the Payment Edge</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
/* Layout: one reading column, 65ch of text, figures breaking out to the full 940px. */
:root {
  --bg: #f5f7f9; --surface: #ffffff; --ink: #0f1720; --ink-2: #485564; --ink-3: #6b7786;
  --rule: #d9dfe6; --wash: #e9eff6; --accent: #1b4f93;
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --crit: #d03b3b; --good: #0ca30c;
  --display: "IBM Plex Sans Condensed", "Arial Narrow", sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0d1116; --surface: #161b22; --ink: #edf0f4; --ink-2: #b4bdc8; --ink-3: #8a95a3;
  --rule: #2a323d; --wash: #1a2533; --accent: #86b6ef;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --crit: #e66767; --good: #0ca30c; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0d1116; --surface: #161b22; --ink: #edf0f4; --ink-2: #b4bdc8; --ink-3: #8a95a3;
  --rule: #2a323d; --wash: #1a2533; --accent: #86b6ef;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --crit: #e66767; --good: #0ca30c; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--ink); font: 400 16px/1.6 var(--body); margin: 0 }
.wrap { max-width: 972px; margin: 0 auto; padding-block: 40px 72px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: flex; flex-direction: column; gap: 56px }
section { display: flex; flex-direction: column; gap: 18px; min-width: 0 }
p, .prose { max-width: 65ch; margin: 0 }
h1 { font: 600 clamp(32px, 6vw, 52px)/1.05 var(--display); letter-spacing: -0.01em; margin: 0; max-width: 18ch; text-wrap: balance }
h2 { font: 600 26px/1.15 var(--display); margin: 0; text-wrap: balance }
h3 { font: 600 15px/1.3 var(--body); margin: 0 }
.eyebrow { font: 500 12px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3) }
.lead { font-size: 19px; line-height: 1.5; color: var(--ink) }
.muted { color: var(--ink-2); font-size: 14px }
.mono, .num { font-family: var(--mono); font-variant-numeric: tabular-nums }
a { color: var(--accent) }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
header { display: flex; flex-direction: column; gap: 20px }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0; border-top: 2px solid var(--ink); border-bottom: 1px solid var(--rule) }
.stat { padding: 16px 16px 16px 0; display: flex; flex-direction: column; gap: 4px }
.stat b { font: 500 30px/1.1 var(--mono); font-variant-numeric: tabular-nums }
.stat span { font-size: 13px; line-height: 1.4; color: var(--ink-2) }

.figure { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0 }
.figure > h3 + p { margin-top: -6px }
.scroll { overflow-x: auto }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px }
.chart { width: 100%; height: auto; display: block; font-family: var(--body) }
.chart .grid { stroke: var(--rule); stroke-width: 1 }
.chart .zero { stroke: var(--ink-3); stroke-width: 1 }
.chart .base { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 3 3 }
.chart .tick { fill: var(--ink-3); font-size: 11px; font-family: var(--mono) }
.chart .colhead { fill: var(--ink-2); font-size: 11.5px; font-weight: 500 }
.chart .endlabel, .chart .rowlabel { fill: var(--ink); font-size: 12px }
.chart .val { fill: var(--ink); font-size: 12px; font-family: var(--mono) }
.chart .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round }
.chart .line.s1 { stroke: var(--s1) } .chart .dot.s1 { fill: var(--s1) }
.chart .line.s2 { stroke: var(--s2) } .chart .dot.s2 { fill: var(--s2) }
.chart .line.s3 { stroke: var(--s3) } .chart .dot.s3 { fill: var(--s3) }
.chart .dot { stroke: var(--surface); stroke-width: 2; cursor: default }
.chart .threshold { stroke: var(--crit); stroke-width: 1.5; stroke-dasharray: 5 4 }
.chart .threshold-label { fill: var(--ink-2) }
.chart .rowbg { fill: transparent }
.chart .row:hover .rowbg, .chart .row:focus .rowbg { fill: var(--wash) }
.chart .row.best .rowbg { fill: var(--wash) }
.chart .row { outline: none }
.chart .on { fill: var(--ink) } .chart .off { fill: var(--rule) }
.chart .whisker { stroke: var(--s1); stroke-width: 2; opacity: 0.55 }
.chart .box { fill: var(--s1) }
.chart .mean { fill: var(--ink); stroke: var(--surface); stroke-width: 2 }
.chart .plain { fill: var(--surface); stroke: var(--ink); stroke-width: 1.5 }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--ink-2) }
.legend span { display: inline-flex; align-items: center; gap: 7px }
.swatch { width: 14px; height: 3px; border-radius: 2px; display: inline-block; background: var(--ink-3) }
.swatch.s1 { background: var(--s1) } .swatch.s2 { background: var(--s2) } .swatch.s3 { background: var(--s3) }
.swatch.k-dot { width: 10px; height: 10px; border-radius: 50% }
.swatch.k-mean { width: 10px; height: 10px; border-radius: 50%; background: var(--ink) }
.swatch.k-box { width: 18px; height: 8px; border-radius: 4px; background: var(--s1) }
.swatch.k-whisker { width: 22px; height: 2px; background: var(--s1); opacity: 0.55 }
.swatch.k-plain { width: 9px; height: 9px; border-radius: 0; background: var(--surface); border: 1.5px solid var(--ink); transform: rotate(45deg) }
.swatch.k-thresh { width: 22px; height: 0; background: none; border-top: 2px dashed var(--crit) }
.swatch.k-base { width: 0; height: 14px; background: none; border-left: 1px dashed var(--ink) }

table { border-collapse: collapse; width: 100%; font-size: 14px }
th, td { text-align: left; padding: 9px 12px 9px 0; border-bottom: 1px solid var(--rule); vertical-align: top }
thead th { font: 500 11.5px/1.3 var(--mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); vertical-align: bottom }
tbody th { font-weight: 500 }
td.num, th.num { text-align: right; white-space: nowrap; padding-right: 0; padding-left: 12px }
.sub { display: block; font-weight: 400; font-size: 12.5px; color: var(--ink-3) }
.barcell { min-width: 220px; display: flex; align-items: center; gap: 10px }
.barcell .num { width: 44px; text-align: right; flex: none }
.track { flex: 1; min-width: 0; display: flex }
.bar { height: 14px; background: var(--s1); border-radius: 0 4px 4px 0; display: block }
.bar:hover, .bar:focus { filter: brightness(1.12) }

.pipeline { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; overflow: hidden }
.stage { border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); margin: 0 -1px -1px 0; padding: 14px; display: flex; flex-direction: column; gap: 4px; min-width: 0 }
.stage-n { font: 500 11px var(--mono); color: var(--ink-3) }
.stage-name { font: 600 16px/1.2 var(--display) }
.stage-q { font-size: 13px; line-height: 1.4; color: var(--ink-2); min-height: 2.8em }
.modes { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; line-height: 1.35 }
.modes li { padding: 4px 6px; border-left: 2px solid var(--s2); background: var(--bg); cursor: default }
.modes .mono { color: var(--ink-3); font-size: 11px }
.cascade { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font: 500 12.5px var(--mono) }
.cascade span { padding: 4px 8px; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface) }
.cascade i { font-style: normal; color: var(--ink-3) }

.receipts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px }
.receipt { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 16px; font: 400 13px/1.5 var(--mono); display: flex; flex-direction: column; gap: 2px; min-width: 0 }
.receipt-head { font: 600 14px var(--body); padding-bottom: 8px; border-bottom: 1px dashed var(--rule); margin-bottom: 8px }
.receipt-line, .receipt-total { display: flex; justify-content: space-between; gap: 12px }
.receipt-sub { color: var(--ink-3); font-size: 12px; padding-left: 12px; overflow-wrap: anywhere }
.receipt-total { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--rule); font-weight: 500 }
.bad { color: var(--crit) } .good { color: var(--good) }

.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; counter-reset: s }
.steps li { border-top: 2px solid var(--ink); padding-top: 10px; display: flex; flex-direction: column; gap: 4px; min-width: 0 }
.steps li.hold { border-top-color: var(--rule); color: var(--ink-2) }
.steps .k { font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3) }
.steps .n { font: 600 18px/1.2 var(--display) }
.steps .v { font: 500 15px var(--mono) }
.steps p { font-size: 13.5px; line-height: 1.45; color: var(--ink-2) }

.trio { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px }
.trio > div { display: flex; flex-direction: column; gap: 10px; min-width: 0 }
.code { font: 400 12px/1.5 var(--mono); background: var(--bg); border: 1px solid var(--rule); border-radius: 4px; padding: 12px; margin: 0; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere }
.grouprow th { font: 500 11.5px/1.3 var(--mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); padding-top: 16px }
.formula { font: 400 13.5px/1.7 var(--mono); background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 16px; overflow-x: auto; white-space: pre }
ul.plain { margin: 0; padding-left: 20px; max-width: 65ch; display: flex; flex-direction: column; gap: 8px }
details summary { cursor: pointer; font-size: 14px; color: var(--accent) }
footer { border-top: 1px solid var(--rule); padding-top: 20px; font-size: 13.5px; color: var(--ink-2); display: flex; flex-direction: column; gap: 6px }
#tip { position: fixed; z-index: 20; pointer-events: none; background: var(--ink); color: var(--bg); font: 400 12.5px/1.45 var(--body); padding: 8px 10px; border-radius: 4px; max-width: 280px; white-space: pre-line }
#tip b { font-weight: 600; display: block }
@media (prefers-reduced-motion: no-preference) { .bar { transition: filter .12s } }
</style>

<div class="wrap">
<header>
  <div class="eyebrow">Independent project · not affiliated with Windcave or TypeSafe AI · illustrative priors, not company data</div>
  <h1>What agentic commerce is worth to a gateway, after everything that breaks</h1>
  <p class="lead">When software starts buying on people’s behalf, a payment gateway gets more transactions, smaller ones, and a set of failures it has never had to price. This project puts Jev, TypeSafe AI’s decision model, at the one point in a payment where a rule cannot decide, for a gateway shaped like Windcave’s (online checkout plus a large unattended estate). Then it breaks the whole thing on purpose and works out what to build and in what order.</p>
  <p>The answer the model gives: build <strong>${esc(order.map((s) => BETS[s.bet].label.toLowerCase()).join(', then '))}</strong>. Agent-ready rails on their own lose money in ${pct(railsOnly.pLoss)} of simulated worlds, because they bring in the volume and its failure modes together. Micro-settlement is a real option and the model says when to exercise it.</p>
  <div class="stats">
    <div class="stat"><b>${money(best.mean)}</b><span>Expected value of ${esc(bestLabel.toLowerCase())} against doing nothing</span></div>
    <div class="stat"><b>${prob(best.pLoss)}</b><span>Share of worlds where that portfolio loses money</span></div>
    <div class="stat"><b>${pct(best.pBest)}</b><span>Share of worlds where it is the best of all 16 options</span></div>
    <div class="stat"><b>${pct(railsOnly.pLoss)}</b><span>Share of worlds where rails alone lose money</span></div>
  </div>
  <p class="muted">${esc(meta.unit)}. ${meta.draws.toLocaleString('en-NZ')} simulated worlds. Every input is a stated prior in one file, built to be replaced with real figures.</p>
</header>

<section>
  <div class="eyebrow">The decision model</div>
  <h2>Jev estimates. The gateway decides.</h2>
  <p>Jev is TypeSafe’s first System One model: a model built to make fast, structured decisions that software uses directly. You send it a state and a set of typed questions. It evaluates every question in parallel, each in isolation against the same state, and returns typed answers with probabilities. It does not generate text. A payment gateway needs exactly that: a number it can act on inside a latency budget.</p>
  <p>The typed questions are called primitives. There are four, and this gateway uses one of them.</p>
  <div class="figure"><div class="scroll"><table><thead><tr><th>Primitive</th><th>Asks</th><th>Returns</th><th>In this gateway</th></tr></thead><tbody>
    <tr><th scope="row">Noul</th><td>Is this statement true?</td><td class="mono">noul</td><td><strong>Used twice per agent payment.</strong> The value is the probability the answer is yes, which is what an expected-value rule needs.</td></tr>
    <tr><th scope="row">Choice</th><td>Which option from a list?</td><td class="mono">choice, probabilities, confidence</td><td>Not used. Asking for approve, challenge or decline would put the gateway’s costs inside the model.</td></tr>
    <tr><th scope="row">Score</th><td>Where on a rubric?</td><td class="mono">score, probabilities, confidence</td><td>Not used. The question is whether, not how much.</td></tr>
    <tr><th scope="row">Box</th><td>Where in this image?</td><td class="mono">box, confidence</td><td>Not used. There is no image in a payment.</td></tr>
  </tbody></table></div></div>
  <p>Most of an agent payment can be checked by rule. A signature verifies or it does not; a budget is exceeded or it is not. One question cannot: an agent told to do the weekly shop buys a prepaid Visa card at the supermarket checkout. The merchant category matches, the cap is respected, and the cardholder will dispute it. That judgement is one Noul. TypeSafe’s own guidance is to use code where code will do, ask one narrow question per judgement, and combine the answers in code. This pipeline is built that way.</p>
  <div class="figure">
    <div class="trio">
      <div><h3>1. The gateway sends a state and two Nouls</h3><pre class="code">${esc(JSON.stringify({ model: ex.request.model, state: ex.request.state, questions: ex.request.questions }, null, 1))}</pre></div>
      <div><h3>2. Jev answers each one</h3><pre class="code">${esc(JSON.stringify({ model: ex.request.model, answers: { unauthorised: { type: 'noul', noul: ex.answer.unauthorised }, outside_mandate: { type: 'noul', noul: ex.answer.outside_mandate } } }, null, 1))}</pre><p class="muted">${ex.real ? 'Jev’s actual answer to this request.' : 'Illustrative answer.'} A Noul is the probability that the answer is yes.</p></div>
      <div><h3>3. Code combines them and decides</h3><table><tbody>
        <tr><th scope="row">Approve</th><td class="num">${dollars2(ex.ev.approve)}</td></tr>
        <tr><th scope="row">Challenge the cardholder</th><td class="num">${dollars2(ex.ev.stepUp)}</td></tr>
        <tr><th scope="row">Decline</th><td class="num">${dollars2(ex.ev.decline)}</td></tr>
        </tbody></table><p class="muted">Chosen: <strong>${ex.action === 'step_up' ? 'challenge' : ex.action}</strong>. The probability is the model’s. The ticket, the margin and the chargeback cost are the gateway’s.</p></div>
    </div>
  </div>
  <p>Three things are never asked of a model: whether a signature is valid, whether a cap or budget is exceeded, and whether the ledger balances. Those are checked.</p>
</section>

${decision.measured ? `<section><div class="eyebrow">The real Jev</div>${measuredBlock(decision.measured)}` : '<section hidden>'}
</section>

<section>
  <div class="eyebrow">Valuation</div>
  <h2>Expected value, with the Jevons effect priced in</h2>
  <p>Expected value asks what a bet is worth on average across the worlds you think are possible. Applied to agentic commerce it usually prices today’s transactions with a different payer. That misses the main effect. When the cost of using something falls, more of it gets used. An agent removes most of the effort of a purchase, so purchases multiply and shrink.</p>
  <div class="formula">count   = baseline × frictionRatio ^ −elasticity        more transactions
ticket  = baseline × (count multiplier) ^ −fragmentation  smaller ones

value(bets) = E[ Σₜ intentsₜ × netPerIntent(bets, agentShareₜ, ticket) × retentionₜ / (1+r)ᵗ ] − build − run</div>
  <p><span class="mono">netPerIntent</span> is measured, not assumed. A simulator runs a working payment pipeline against agents, humans and attackers, with ${Object.keys(FAILURE_MODES).length} failure modes injected, and reports what each combination of controls earns after every failure is paid for. The same expected-value rule that turns Jev’s probability into an action is used here at a five-year timescale.</p>
</section>

<section>
  <div class="eyebrow">The system</div>
  <h2>Nine stages, ${Object.keys(FAILURE_MODES).length} ways to lose money</h2>
  <p>Each stage answers one question about a payment. Under each are the failure modes that live there. Hover or focus one for its trigger and effect.</p>
  <ol class="pipeline">${stageCards}</ol>
  <p>Most of the cost comes from failures feeding each other. The expensive chain runs through four stages:</p>
  <div class="cascade"><span>F08 lost response</span><i>→</i><span>F09 agent retries at machine speed</span><i>→</i><span>F08 more timeouts</span><i>→</i><span>F10 duplicate charge</span><i>→</i><span>dispute</span><i>→</i><span>F16 scheme threshold</span></div>
</section>

<section>
  <div class="eyebrow">One payment</div>
  <h2>The same agent, the same lost response, two gateways</h2>
  <p>An agent pays $23.40 for an EV charging session. The issuer charges the card and the response is lost. The agent does what client code does and retries with a fresh idempotency key. This is the pipeline’s real output from <span class="mono">npm run demo</span>.</p>
  <div class="receipts">${trace.map(traceBlock).join('')}</div>
</section>

<section>
  <div class="eyebrow">At volume</div>
  <h2>What agent traffic does to the gateway as it stands</h2>
  <p>${pct(meta.reference.agentShare)} of purchase intents come from agents, at tickets ${meta.reference.ticketFactor}× today’s size. Gateway net is fee revenue minus processing, dispute handling and scheme penalties, per 1,000 purchase intents.</p>
  ${['online', 'unattended'].map((seg) => `<div class="figure"><h3>${seg === 'online' ? 'Online checkout' : 'Unattended: EV charging, parking, vending'}</h3>
    <div class="scroll"><table><thead><tr><th>Configuration</th><th>Gateway net per 1,000 intents</th><th class="num">Honest agent<br>payments completed</th><th class="num">Dispute<br>ratio</th><th class="num">Duplicate<br>charges</th></tr></thead>
    <tbody>${scenarioRows(seg)}</tbody></table></div></div>`).join('')}
  <p>Rails alone complete far more agent payments. They also roughly double the dispute ratio and the duplicate rate, because every agent that now gets through brings its retry behaviour and its mandate problems with it.</p>
</section>

<section>
  <div class="eyebrow">Under stress</div>
  <h2>A brownout turns the retry loop into a cliff</h2>
  <p>Raise the issuer’s base timeout rate and watch what the three configurations do. Agents retry immediately and several times, which adds load, which causes more timeouts. Rails alone fare worst, because they let far more agent traffic reach the issuer. The dashed line is where scheme monitoring starts charging per dispute.</p>
  <div class="figure">
    ${legend([...Object.values(CONFIG).map((c) => [c.cls, c.label]), ['k-thresh', '\u26a0 Scheme monitoring threshold, 0.9% (illustrative)']])}
    <div class="pair">
      <div><h3>Duplicate charges, share of payments</h3>${lineChart({ id: 'c-dup', series: series('duplicateRate'), yMax: dupMax, yFmt: axisPct(dupMax), xLabel: 'Issuer base timeout rate' })}</div>
      <div><h3>Dispute ratio</h3>${lineChart({ id: 'c-disp', series: series('disputeRatio'), yMax: dispMax, yFmt: axisPct(dispMax), xLabel: 'Issuer base timeout rate', threshold: { value: 0.009, label: 'monitoring threshold 0.9%' } })}</div>
    </div>
    <details><summary>Table view</summary><div class="scroll"><table><thead><tr><th>Base timeout</th>${Object.values(CONFIG).map((c) => `<th class="num">${esc(c.label)}<br>duplicates</th><th class="num">disputes</th>`).join('')}</tr></thead>
    <tbody>${brownout.naive.map((p, i) => `<tr><td class="mono">${pct(p.base, 1)}</td>${Object.keys(CONFIG).map((k) => `<td class="num">${pct(brownout[k][i].duplicateRate, 2)}</td><td class="num">${pct(brownout[k][i].disputeRatio, 2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
  </div>
</section>

<section>
  <div class="eyebrow">The model under attack</div>
  <h2>Four ways the decision model fails, and what each guard is worth</h2>
  <p>A decision model in a payment path is a dependency with its own failure modes. Each pair below holds everything else fixed, breaks the model in one way, and runs it without and then with the one guard that addresses it. ${decision.measured ? 'A simulation of millions of payments cannot call Jev for each one, so it replays what was measured: Jev’s skill on the borderline payments, its calibration, its latency and its error rate. Each broken variant then changes one of those.' : 'The model here is a simulated stand-in whose skill, calibration, latency and behaviour are dials. It is not Jev, and nothing here measures Jev.'}</p>
  <div class="figure"><div class="scroll"><table><thead><tr><th>Condition</th><th class="num">Gateway net<br>per 1,000</th><th class="num">Merchant loss<br>per 1,000</th><th class="num">Honest agent<br>payments completed</th><th class="num">Decided by<br>fallback</th></tr></thead>
  <tbody>${groups.map((gName) => `<tr class="grouprow"><th colspan="5">${esc(gName === 'baseline' ? 'Baseline' : gName)}</th></tr>` + decision.experiment.filter((r) => r.group === gName).map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">$${r.net.toFixed(1)}</td><td class="num">$${r.merchantLoss.toFixed(1)}</td><td class="num">${pct(r.completion)}</td><td class="num">${pct(r.fallbackShare)}</td></tr>`).join('')).join('')}</tbody></table></div></div>
  <p>The guard that matters most is the plainest one. When one call in five returns nothing and there is no fallback, completed agent payments fall from ${pct(exp.jev.completion)} to ${pct(exp.outage_raw.completion)}. With a fallback to the static rule they hold at ${pct(exp.outage_guarded.completion)}.</p>
  <p>${decision.measured ? 'Recalibration comes next, and the measurement is why. Jev\u2019s probabilities are underconfident, so acting on them as stated' : 'Acting on an overconfident model\u2019s probabilities as stated'} completes ${pct(exp.miscal_raw.completion)} of honest agent payments against ${pct(exp.miscal_guarded.completion)} once recalibrated, and merchant losses are $${exp.miscal_raw.merchantLoss.toFixed(0)} against $${exp.miscal_guarded.merchantLoss.toFixed(0)} per 1,000 intents. Planted text moves merchant losses from $${exp.inject_guarded.merchantLoss.toFixed(0)} to $${exp.inject_raw.merchantLoss.toFixed(0)}, and a drifted alias from $${exp.drift_guarded.merchantLoss.toFixed(0)} to $${exp.drift_raw.merchantLoss.toFixed(0)}. Differences of a few dollars are within the noise of the simulation.</p>
  <div class="pair">
    <div class="figure"><h3>How good does it have to be?</h3><p class="muted">Merchant loss per 1,000 purchase intents, by the model’s skill at telling bad payments from good.</p>${skillChart({ skill: decision.skill, staticLoss: exp.static.merchantLoss })}</div>
    <div class="prose" style="display:flex;flex-direction:column;gap:12px">
      <p>Against the static rule, the decision layer is worth ${money(decision.value.jev.mean)} ${decision.measured ? 'at the skill measured' : 'at the skill I assumed'}, ${money(decision.value.weak.mean)} if it is weak and ${money(decision.value.strong.mean)} if it is strong. Without a fallback, during an outage, it is worth ${money(decision.value.noFallback.mean)}.</p>
      <p>Most of that value does not come from catching more fraud. It comes from no longer declining honest agents: the static rule turns away about one in twelve, and a calibrated model at these base rates approves nearly all of them, correctly.</p>
      <p>The model’s skill shows up in merchant losses. Below an AUC of roughly ${auc(decision.skill.find((p) => p.merchantLoss < exp.static.merchantLoss)?.separation ?? 3).toFixed(2)} it lets through more than the static rule did. That threshold is measurable in shadow mode before Jev decides a single live payment.</p>
    </div>
  </div>
</section>

<section>
  <div class="eyebrow">The decision</div>
  <h2>All sixteen combinations of four bets</h2>
  <p>Each row is one portfolio, valued against doing nothing in the same simulated world. The diamond is plain expected value with the Jevons term switched off. Where the dot and the diamond sit far apart, a conventional business case would get the answer wrong.</p>
  <div class="figure">
    ${legend([['k-mean', 'Expected value (mean)'], ['k-box', 'Middle half of worlds'], ['k-whisker', '5th to 95th percentile'], ['k-plain', 'Plain EV, no Jevons term']])}
    <div class="scroll">${valueChart({ ranked: value.ranked, BETS, BET_KEYS, best: value.best })}</div>
    <details><summary>Table view</summary><div class="scroll"><table><thead><tr><th>Portfolio</th><th class="num">Value</th><th class="num">5th</th><th class="num">95th</th><th class="num">Plain EV</th><th class="num">P(loss)</th><th class="num">P(best)</th></tr></thead>
    <tbody>${value.ranked.map((p) => `<tr><th scope="row">${p.bets.length ? esc(p.bets.map((b) => BETS[b].short).join(' + ')) : 'Do nothing'}</th><td class="num">${money(p.mean)}</td><td class="num">${money(p.p05)}</td><td class="num">${money(p.p95)}</td><td class="num">${money(p.plainMean)}</td><td class="num">${prob(p.pLoss)}</td><td class="num">${prob(p.pBest)}</td></tr>`).join('')}</tbody></table></div></details>
  </div>
  <p>Rails alone: plain EV says ${money(railsOnly.plainMean)}; with the Jevons term it is ${money(railsOnly.mean)}. The extra volume Jevons predicts arrives with its failure modes attached, and without the other two bets those cost more than the volume earns. Rails and the mandate layer together are worth ${money(synergy('rails', 'mandate'))} more than the sum of each alone.</p>
</section>

<section>
  <div class="eyebrow">Sequencing</div>
  <h2>Build order</h2>
  <p>At each step, add the bet with the largest marginal value given what already exists. The order matters because the bets are complements: what one is worth depends on which others are in place.</p>
  <ol class="steps">${value.sequence
    .map((s, i) => {
      const hold = !best.bets.includes(s.bet);
      return `<li class="${hold ? 'hold' : ''}"><span class="k">${hold ? 'Hold as an option' : `Step ${i + 1}`}</span><span class="n">${esc(BETS[s.bet].label)}</span><span class="v">${money(s.marginal)} marginal</span><p>${esc(BETS[s.bet].pitch)}</p><p>Portfolio so far loses money in ${prob(s.pLoss)} of worlds.</p></li>`;
    })
    .join('')}</ol>
</section>

<section>
  <div class="eyebrow">What would change my mind</div>
  <h2>The priors the decision is most sensitive to</h2>
  <p>Each bar moves one prior from its 10th to its 90th percentile and holds the rest at their medians. The dashed line is the value with every prior at its median. The long bars are what is worth finding out before spending the money.</p>
  <div class="figure">
    ${legend([['k-box', `Value of ${bestLabel.toLowerCase()} against doing nothing (NZ$m)`], ['k-base', 'All priors at median']])}
    <div class="scroll">${tornado({ sens: value.sensitivity, BETS })}</div>
  </div>
  <div class="pair">
    <div class="figure"><h3>When micro-settlement becomes worth building</h3><p class="muted">Marginal value of adding it to the recommended three (NZ$m), by unattended volume elasticity.</p>${breakevenChart(be)}</div>
    <div class="prose" style="display:flex;flex-direction:column;gap:12px">
      <p>Adding micro-settlement changes the expected value by ${money(full.mean - best.mean)}, and it is the best choice in ${pct(full.pBest)} of worlds. It is the only bet whose value is mostly the Jevons term: plain EV puts it at ${money(full.plainMean - best.plainMean)}.</p>
      <p>${be.value === null ? 'Within the prior range it does not break even on elasticity alone.' : `It breaks even when unattended volume elasticity passes <strong>${be.value.toFixed(2)}</strong>; the prior mode is ${be.mode}.`} That is a measurable trigger: run micro-pricing with a handful of charging or parking operators and watch whether session counts respond.</p>
      <p>The first version of this model priced aggregation by splitting the fixed fee across the batch. It lost money in every world. The engineering is the easy half of that bet; the pricing is the hard half.</p>
    </div>
  </div>
</section>

<section>
  <div class="eyebrow">Ablation</div>
  <h2>Which controls are load-bearing</h2>
  <p>Start from all nine controls and remove one. The figures are what its absence costs per 1,000 purchase intents, to the gateway and to its merchants. A control that costs nothing to remove is not earning its place at these conditions.</p>
  <p>The retry budget is the clearest case. With intent-derived idempotency in place it adds almost nothing, here or in a brownout. I would ship idempotency first and treat the budget as defence in depth.</p>
  <div class="figure"><div class="scroll"><table><thead><tr><th>Control removed</th><th class="num">Online<br>gateway</th><th class="num">Online<br>merchants</th><th class="num">Unattended<br>gateway</th><th class="num">Unattended<br>merchants</th></tr></thead><tbody>${ablationRows}</tbody></table></div></div>
</section>

<section>
  <div class="eyebrow">Register</div>
  <h2>Every failure mode, priced</h2>
  <p>Cost is gateway cost plus merchant loss plus lost sales, per 1,000 purchase intents, averaged over both segments. Two entries have no mitigation in this model and one exists only because a control was added. Those are listed on purpose. The figures are at normal issuer conditions, where the retry storm and the dispute-ratio cliff cost nothing. The brownout section shows what they do under stress.</p>
  <div class="figure"><div class="scroll"><table><thead><tr><th>ID</th><th>Failure mode</th><th>Trigger</th><th>Addressed by</th><th class="num">Today</th><th class="num">Recommended</th></tr></thead><tbody>${registerRows}</tbody></table></div></div>
</section>

<section>
  <div class="eyebrow">Beyond one gateway</div>
  <h2>What it would take to be worth a billion</h2>
  <p>Everything above values the stack on one gateway’s own traffic. That is a feature, and a feature is not worth a billion. It becomes worth more than the product it started in only if other people’s payments run through it. The part that can travel is the conformance receipt: a signed record, issued at authorisation, of the mandate, the pinned model, what it was asked, what it said and what the gateway did. It is committed to an append-only log, so it cannot be written after a dispute arrives.</p>
  <p>Today no card network rule says who is liable when an agent buys the wrong thing. Disputes are won or lost on proving what the customer authorised the agent to do. A receipt is that proof. Whether it is worth anything to anyone else depends on whether the rules come to recognise it.</p>
  <div class="figure"><h3>Agent-dispute claims, basis points of agent volume</h3><p class="muted">Merchant losses from disputes about authorisation or scope. A guarantee is only a business where this number is small.</p>
    <div class="scroll"><table><tbody>${thesis.guarantee.map((g) => `<tr><th scope="row">${esc(g.label)}</th><td><div class="barcell"><div class="track"><span class="bar" style="width:${Math.max(0.6, (g.claimsBps / claimMax) * 100).toFixed(1)}%" tabindex="0" data-tip="${esc(`${g.label}\n${g.claimsBps.toFixed(0)} basis points of agent volume`)}"></span></div><span class="num">${g.claimsBps.toFixed(0)}</span></div></td></tr>`).join('')}</tbody></table></div>
  </div>
  <p>The stack turns a loss rate nobody would insure, ${thesis.guarantee[0].claimsBps.toFixed(0)} basis points, into ${thesis.claims.today.toFixed(0)}. If rules recognise receipts it falls to ${thesis.claims.recognised.toFixed(0)}, and a guarantee priced at 40 basis points becomes a business. Under today’s rules it does not.</p>
  <p>Two engines then scale with other people’s volume: a fee per receipt, and a fee for carrying agent-dispute losses on receipted payments. Both depend on one number nobody knows, which is the share of the world’s agent payments that carry this receipt. Across ${(20000).toLocaleString('en-NZ')} simulated worlds:</p>
  <div class="stats">
    <div class="stat"><b>${usd(thesis.all.p50)}</b><span>Median value, all worlds</span></div>
    <div class="stat"><b>${pct(thesis.all.pOver1bn)}</b><span>Worlds in which it is worth a billion or more</span></div>
    <div class="stat"><b>${pct(thesis.recognised.pOver1bn)}</b><span>If rules recognise receipts (median ${usd(thesis.recognised.p50)})</span></div>
    <div class="stat"><b>${prob(thesis.today.pOver1bn)}</b><span>If rules stay as they are (median ${usd(thesis.today.p50)})</span></div>
  </div>
  <div class="figure"><h3>Share of global agent volume the receipt must carry to be worth US$1bn</h3><p class="muted">Every other input at its prior mode. Above 100% means it cannot be done at that market size.</p>
    <div class="scroll"><table><thead><tr><th>Agent-executed volume, year five</th><th class="num">If rules recognise receipts</th><th class="num">Receipts a year</th><th class="num">If rules stay as they are</th></tr></thead>
    <tbody>${thesis.required.recognised.map((r, i) => `<tr><th scope="row">US$${r.gmvTrillion}tn</th><td class="num">${pct(r.share, 1)}</td><td class="num">${r.receiptsBn.toFixed(1)}bn</td><td class="num">${thesis.required.today[i].reachable ? pct(thesis.required.today[i].share, 1) : 'not reachable'}</td></tr>`).join('')}</tbody></table></div>
  </div>
  <p>A billion is the tail and not the base case. It needs about ${thesis.required.recognised[0].receiptsBn.toFixed(1)} billion receipted agent payments a year in a world where the rules recognise them. That is a standard, not a product, and the work that moves the odds is done with schemes and issuers more than in code. The open specification is in <span class="mono">docs/RECEIPT-SPEC.md</span>.</p>
</section>

<section>
  <div class="eyebrow">Limits</div>
  <h2>What this is and is not</h2>
  <ul class="plain">
    <li>The inputs are priors, not Windcave figures. Windcave is privately held and I have no inside data. The output is reported per 100M baseline transactions so it scales with real volume and does not pretend to know it.</li>
    <li>${decision.measured ? `Jev was measured on ${decision.measured.answered} synthetic labelled payments, not on a gateway’s real disputes, and the borderline labels are mine. The simulator replays those measurements statistically; it does not call Jev for each simulated payment. Latency was measured from a cloud build environment, not from a gateway’s own network.` : 'The decision model in every simulation is a stand-in, not Jev. Running <span class="mono">node src/cli.js measure</span> with a key replaces its priors with the real model’s measured behaviour.'}</li>
    <li>The guard is handed every outcome immediately. In production, labels arrive weeks later and only for approved payments, which makes calibration harder to measure than it looks here.</li>
    <li>The pipeline is a reference implementation. Mandates are signed with real Ed25519 and the ledger is double-entry with enforced invariants, but it implements none of the live agent-payment protocols and talks to no card network.</li>
    <li>The dispute thresholds and penalties are illustrative. Each scheme’s monitoring programme has its own definitions.</li>
    <li>Regulatory liability for agent-initiated payments is unsettled, and the model holds it fixed.</li>
    <li>The ranking is stable across seeds. The dollar figures move with the priors, which is what the sensitivity chart is for.</li>
  </ul>
</section>

<footer>
  <div>Run it: <span class="mono">git clone</span>, then <span class="mono">npm test</span> and <span class="mono">npm run demo</span>. Node 20 or later, no dependencies. Jev is a product of TypeSafe AI; this page is not affiliated with them.</div>
  <div>Source, tests, decision records and the full register: <a href="https://github.com/brunohart/agent-commerce">github.com/brunohart/agent-commerce</a></div>
</footer>
</div>
<div id="tip" hidden></div>
<script>
(function () {
  var tip = document.getElementById('tip');
  function show(el, x, y) {
    var parts = el.getAttribute('data-tip').split('\\n');
    tip.textContent = '';
    var b = document.createElement('b');
    b.textContent = parts[0];
    tip.appendChild(b);
    tip.appendChild(document.createTextNode(parts.slice(1).join('\\n')));
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px';
    tip.style.top = (y + h + 24 > window.innerHeight ? y - h - 12 : y + 16) + 'px';
  }
  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el) show(el, e.clientX, e.clientY); else tip.hidden = true;
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return;
    var r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.bottom);
  });
  document.addEventListener('focusout', function () { tip.hidden = true; });
})();
</script>`;
}
