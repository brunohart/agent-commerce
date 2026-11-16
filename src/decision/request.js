// What the gateway asks Jev about a payment.
//
// Jev (TypeSafe AI) is a decision model: it takes a state and a set of typed
// questions and returns an answer to each with a probability. It does not generate
// text. That is the right shape for a payment gateway, which has a few hundred
// milliseconds, needs a number it can act on, and has no use for prose.
//
// The division of labour in this repo is strict:
//
//   Jev estimates.      "How likely is it that this payment is unauthorised?"
//   The gateway decides. Expected value turns that probability into approve,
//                        challenge or decline (src/gateway/risk.js).
//   Rules stay rules.    Signatures, caps, budgets and the ledger are never asked
//                        of a model. They are checked, not estimated.
//
// Request shape follows TypeSafe's public quickstart material as of late 2026
// (state + typed questions; "noul" is their yes/no type that returns a probability).
// I could not reach the primary API reference from the environment this was built
// in, so treat field names as provisional and check them against docs.typesafe.ai.

export const PINNED_MODEL = 'jev-1.13';
export const MOVING_ALIAS = 'jev-latest';

export const QUESTIONS = {
  unauthorised: {
    type: 'noul',
    question: 'Is this payment being made without the cardholder having authorised this agent to make it?',
  },
  outside_mandate: {
    type: 'noul',
    question:
      'Does the item being bought fall outside what the mandate describes, even if the merchant category matches?',
  },
};

/**
 * Build the state Jev sees. Two rules:
 *   1. Only fields the gateway derived or verified itself go in as facts.
 *   2. Text supplied by the agent or the merchant is untrusted. With `hygiene` on
 *      it is left out entirely; with it off it is passed through, which is how a
 *      decision model gets talked into an answer (failure mode F20).
 */
export function buildDecisionRequest(req, ctx, { model = PINNED_MODEL, hygiene = true } = {}) {
  const state = {
    payment: {
      amount: req.amount,
      currency: 'NZD',
      merchant_category: req.category,
      unattended: Boolean(ctx.unattended),
    },
    agent: {
      identity_verified: ctx.attested,
      mandate_verified: ctx.mandateVerified,
    },
    mandate: req.mandate
      ? {
          purpose: req.mandate.purpose ?? null,
          max_per_payment: req.mandate.maxPerTxn,
          budget_remaining: Math.max(0, req.mandate.maxTotal - ctx.spent),
        }
      : null,
    item: { description: req.itemDescription ?? null },
  };
  if (!hygiene && req.agentNote) state.agent.note = req.agentNote;
  return {
    wire: { model, state, questions: QUESTIONS },
    // Not sent. Lets the simulated model look up ground truth for this payment.
    ref: req.intentId,
    context: { isAgent: req.isAgent, attested: ctx.attested, mandateVerified: ctx.mandateVerified },
  };
}

// Pull probabilities out of a response, strictly. Anything missing, non-numeric or
// outside [0, 1] makes the whole answer unusable: a decision layer must never act
// on half an answer.
export function parseAnswers(body) {
  const answers = body?.answers;
  if (!answers || typeof answers !== 'object') return null;
  const p = {};
  for (const name of Object.keys(QUESTIONS)) {
    const v = answers[name]?.noul;
    if (typeof v !== 'number' || !(v >= 0 && v <= 1)) return null;
    p[name] = v;
  }
  return p;
}
