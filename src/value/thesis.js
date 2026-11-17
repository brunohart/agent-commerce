// What would have to be true for this to be worth a billion dollars.
//
// The model in model.js values the stack on one gateway's own traffic. That is a
// feature, and features are not worth a billion. A primitive is worth more than the
// product it started in only if other people's transactions run through it.
//
// Three engines, in US$ because the market figures are:
//
//   1. Own traffic        what the stack is worth to the gateway that builds it
//                         (from model.js; reported, not simulated again here)
//   2. Receipt network    a fee per conformance receipt, on other people's payments
//   3. Dispute guarantee  a fee in basis points for carrying agent-dispute losses on
//                         receipted payments, less the claims the simulator predicts
//
// Engines 2 and 3 are driven by one number nobody knows: the share of the world's
// agent payments that carry this receipt. The prior for it is wide and skewed, on
// purpose. This file reports the whole distribution and the probability of a
// billion, and does not pick a point.

import { createRng, quantile } from '../rng.js';

// Triangular (low, mode, high) priors. Sources and reasoning in docs/THESIS.md.
export const THESIS_PRIORS = {
  // Global agent-executed purchase volume in year five, US$ trillion.
  // Morgan Stanley: US$0.19-0.39tn for the US alone by 2030, counting only purchases
  // an agent executes. McKinsey: US$3-5tn globally on a broader definition.
  agentGmvTrillion: [0.3, 1.0, 3.0],
  averageTicket: [40, 80, 150],
  // log10 of the share of that volume carrying this receipt. 10^-3.5 is 0.03%
  // (one mid-sized gateway's own traffic). 10^-1 is 10% (a recognised standard).
  shareLog10: [-3.5, -2.3, -1.0],
  receiptFee: [0.003, 0.01, 0.03], // US$ per receipt
  receiptMargin: [0.6, 0.8, 0.9],
  guaranteeAttach: [0.1, 0.3, 0.6], // share of receipted volume that buys the guarantee
  guaranteeFeeBps: [20, 40, 70],
  claimsMultiplier: [0.6, 1.0, 1.8], // uncertainty on the simulator's claims rate
  guaranteeOpexShare: [0.15, 0.25, 0.4], // of fee revenue
  // Probability that network rules come to recognise receipt-style evidence within
  // the horizon. No binding rule exists today; this is a judgement, not a forecast.
  pRulesRecognise: 0.4,
  profitMultiple: [8, 12, 18],
};

export function sampleThesis(rng, claims) {
  const t = (k) => rng.triangular(...THESIS_PRIORS[k]);
  const recognised = rng.bool(THESIS_PRIORS.pRulesRecognise);
  return {
    gmv: t('agentGmvTrillion') * 1e12,
    ticket: t('averageTicket'),
    // Recognition is what turns a gateway's private record into something other
    // parties want. It shifts the share prior up by half an order of magnitude.
    share: Math.pow(10, t('shareLog10') + (recognised ? 0.5 : 0)),
    receiptFee: t('receiptFee'),
    receiptMargin: t('receiptMargin'),
    attach: t('guaranteeAttach'),
    feeBps: t('guaranteeFeeBps'),
    claimsBps: (recognised ? claims.recognised : claims.today) * t('claimsMultiplier'),
    opexShare: t('guaranteeOpexShare'),
    multiple: t('profitMultiple'),
    recognised,
  };
}

/** Enterprise value of engines 2 and 3 in one world, US$. */
export function evaluateThesis(x) {
  const share = Math.min(1, x.share);
  const receiptedGmv = x.gmv * share;
  const receipts = receiptedGmv / x.ticket;
  const receiptProfit = receipts * x.receiptFee * x.receiptMargin;
  const guaranteedGmv = receiptedGmv * x.attach;
  const fee = (guaranteedGmv * x.feeBps) / 1e4;
  const guaranteeProfit = fee * (1 - x.opexShare) - (guaranteedGmv * x.claimsBps) / 1e4;
  // A guarantee that loses money is not sold. The option is worth zero, not less.
  const profit = receiptProfit + Math.max(0, guaranteeProfit);
  return { receipts, receiptProfit, guaranteeProfit, profit, value: profit * x.multiple };
}

/**
 * @param {{today: number, recognised: number}} claims  Simulated claims rate, bps of agent GMV.
 */
export function thesisMonteCarlo(claims, { draws = 20000, seed = 23 } = {}) {
  const rng = createRng(seed);
  const values = [];
  const byRegime = { recognised: [], today: [] };
  let receiptShare = 0;
  for (let i = 0; i < draws; i++) {
    const x = sampleThesis(rng, claims);
    const r = evaluateThesis(x);
    values.push(r.value);
    byRegime[x.recognised ? 'recognised' : 'today'].push(r.value);
    receiptShare += r.profit > 0 ? r.receiptProfit / r.profit : 0;
  }
  const summarise = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const p = (v) => s.filter((y) => y >= v).length / s.length;
    return {
      n: s.length,
      mean: s.reduce((a, b) => a + b, 0) / s.length,
      p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), p99: quantile(s, 0.99),
      pOver100m: p(1e8), pOver1bn: p(1e9),
    };
  };
  return {
    draws,
    all: summarise(values),
    recognised: summarise(byRegime.recognised),
    today: summarise(byRegime.today),
    receiptShareOfProfit: receiptShare / draws,
    // For a histogram on a log scale.
    quantiles: Array.from({ length: 99 }, (_, i) => quantile([...values].sort((a, b) => a - b), (i + 1) / 100)),
  };
}

// The frontier: for each market size, the share of it this receipt must carry for
// the business to be worth `target`, everything else at its prior mode.
export function requiredShare(claims, { target = 1e9, recognised = true } = {}) {
  const mode = (k) => THESIS_PRIORS[k][1];
  const base = {
    ticket: mode('averageTicket'), receiptFee: mode('receiptFee'), receiptMargin: mode('receiptMargin'),
    attach: mode('guaranteeAttach'), feeBps: mode('guaranteeFeeBps'),
    claimsBps: recognised ? claims.recognised : claims.today,
    opexShare: mode('guaranteeOpexShare'), multiple: mode('profitMultiple'),
  };
  return [0.3, 0.5, 1, 2, 3].map((trillion) => {
    const perUnitShare = evaluateThesis({ ...base, gmv: trillion * 1e12, share: 1 }).value;
    const share = target / perUnitShare;
    return { gmvTrillion: trillion, share, receiptsBn: (trillion * 1e12 * share) / base.ticket / 1e9, reachable: share <= 1 };
  });
}
