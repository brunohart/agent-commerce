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
// Request and response shapes were checked against TypeSafe's API reference
// (docs.typesafe.ai: quick start, Noul, Models) on 16 November 2026:
//   POST https://api.typesafe.ai/v1/systemone, bearer key
//   body     { model, state, questions: { <id>: { type, instructions, criteria? } } }
//   response { model, answers: { <id>: { type: "noul", noul: 0..1 } }, usage }
// A Noul is their yes/no primitive; its value is the probability the answer is yes.
//
// Model ids are full versions. `jev-latest` is an alias that moves: it now resolves
// to jev-1.14.0, released 14 October 2026. A gateway pins the version it tested.

export const PINNED_MODEL = 'jev-1.14.0';
export const MOVING_ALIAS = 'jev-latest';

export const QUESTIONS = {
  // Each question asks one narrow thing, phrased so that a high value means yes.
  unauthorised: {
    type: 'noul',
    instructions: 'Is this payment being made without the cardholder having authorised this agent to make it?',
  },
  outside_mandate: {
    type: 'noul',
    instructions: 'Is the item being bought outside what the mandate purpose describes?',
    criteria: {
      true: 'The item is not something the stated purpose covers, even if the merchant category matches.',
      false: 'The item is an ordinary example of what the stated purpose covers.',
    },
  },
};

/**
 * Build the state Jev sees. Two rules:
 *   1. Only fields the gateway derived or verified itself go in as facts.
 *   2. Text supplied by the agent or the merchant is untrusted. With `hygiene` on
 *      it is left out entirely; with it off it is passed through, which is how a
 *      decision model gets talked into an answer (failure mode F20).
 *
 * Known gap: `item.description` breaks both rules. The caller writes it, the
 * gateway checks it against nothing, and it goes in as a fact with hygiene on or
 * off. The outside_mandate judgement turns on it, so a purchase described as
 * something else is judged as that something else. See test/red-team.test.js and
 * https://github.com/brunohart/agent-commerce/issues/15.
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
