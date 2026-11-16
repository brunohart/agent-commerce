// The action rule. Jev supplies the probability (src/decision); this turns it into
// approve, challenge or decline by comparing expected values.
//
// Keeping the two apart is deliberate. The model's job is to be right about how
// likely something is. What that likelihood is worth depends on the ticket, the
// merchant's margin and the cost of a chargeback, which are the gateway's numbers
// and change without the model changing. The same expected-value logic chooses
// between bets in src/value/model.js, at a five-year timescale instead of 400ms.

/**
 * @param {Object} s
 * @param {number} s.amount
 * @param {number} s.pFraud            Posterior probability this payment is not authorised.
 * @param {number} s.fee               Gateway revenue if approved and honest.
 * @param {number} s.merchantMargin    Merchant's margin on an honest sale (share of amount).
 * @param {number} s.chargebackFee
 * @param {number} s.stepUpCompletion  P(an honest payer completes a challenge).
 * @param {number} s.stepUpCatch       P(a challenge stops a fraudulent payer).
 */
export function decide(s) {
  const honestValue = s.fee + s.merchantMargin * s.amount;
  const fraudCost = s.amount + s.chargebackFee;

  const approve = (1 - s.pFraud) * honestValue - s.pFraud * fraudCost;
  const stepUp =
    (1 - s.pFraud) * s.stepUpCompletion * honestValue -
    s.pFraud * (1 - s.stepUpCatch) * fraudCost;
  const decline = 0;

  let action = 'approve';
  let best = approve;
  if (stepUp > best) {
    action = 'step_up';
    best = stepUp;
  }
  if (decline > best) {
    action = 'decline';
    best = decline;
  }
  return { action, ev: { approve, stepUp, decline } };
}

// Bayes update of a prior fraud rate with a score drawn from N(sep,1) for fraud
// and N(0,1) for honest traffic. Likelihood ratio = exp(sep*x - sep^2/2).
export function posterior(prior, score, separation) {
  const lr = Math.exp(separation * score - (separation * separation) / 2);
  const odds = (prior / (1 - prior)) * lr;
  return odds / (1 + odds);
}
