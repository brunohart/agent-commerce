// Every number the model depends on lives in this file.
//
// None of these are Windcave figures. Windcave is privately held and I have no
// inside data. They are priors: order-of-magnitude values chosen to be defensible
// for a card gateway/acquirer, each one meant to be overwritten by someone who has
// the real number. The point of the repo is the structure of the decision, and
// docs/THESIS.md says which of these priors the conclusion is actually sensitive to.

// ---------------------------------------------------------------------------
// Controls: the things a gateway can build. The simulator switches them on/off.
// ---------------------------------------------------------------------------
export const CONTROLS = {
  protocolAdapter: 'Speak the agent checkout protocols (one adapter, many dialects)',
  attestation: 'Verify agent identity and accept network-issued agent credentials',
  delegatedSca: 'Delegated authentication, so no-human-present does not mean step-up',
  mandateVerify: 'Verify the signed mandate (scope, cap, budget, expiry) before auth',
  mandateEvidence: 'Persist the mandate as dispute evidence',
  decisionLayer: 'Jev estimates each payment; expected value picks approve, challenge or decline',
  decisionGuards: 'Guard the decision model: deadline and fallback, pinned version, recalibration, clean state',
  intentIdempotency: 'Derive the idempotency key from the intent, not from the client',
  retryBudget: 'Retry budget and circuit breaker, plus a definitive status answer on timeout',
  aggregation: 'Aggregate micro-tickets into one scheme-facing authorisation',
};

// ---------------------------------------------------------------------------
// Bets: controls grouped into things you could actually fund and ship.
// ---------------------------------------------------------------------------
export const BETS = {
  rails: {
    label: 'Agent-ready rails',
    short: 'Rails',
    pitch: 'Get the volume: protocols, agent credentials, delegated authentication.',
    controls: ['protocolAdapter', 'attestation', 'delegatedSca'],
    buildCost: [1.5, 2.5, 4.5], // NZ$m, triangular (low, mode, high)
    runCost: [0.3, 0.5, 0.9], // NZ$m per year
  },
  mandate: {
    label: 'Mandate layer',
    short: 'Mandate',
    pitch: 'Keep it clean: verify what the human authorised, let Jev judge what rules cannot, keep the proof.',
    controls: ['mandateVerify', 'mandateEvidence', 'decisionLayer', 'decisionGuards'],
    buildCost: [1.0, 1.8, 3.2],
    runCost: [0.2, 0.4, 0.7],
  },
  storm: {
    label: 'Storm-proofing',
    short: 'Storm',
    pitch: 'Keep it up: agents retry at machine speed, so ambiguity must be removed.',
    controls: ['intentIdempotency', 'retryBudget'],
    buildCost: [0.4, 0.7, 1.3],
    runCost: [0.05, 0.1, 0.2],
  },
  micro: {
    label: 'Micro-settlement',
    short: 'Micro',
    pitch: 'Unlock the Jevons volume: make a $2 purchase economic for the merchant.',
    controls: ['aggregation'],
    buildCost: [1.0, 2.0, 3.5],
    runCost: [0.2, 0.3, 0.6],
  },
};
export const BET_KEYS = Object.keys(BETS);

export function controlsFor(betKeys) {
  const on = Object.fromEntries(Object.keys(CONTROLS).map((k) => [k, false]));
  for (const b of betKeys) for (const c of BETS[b].controls) on[c] = true;
  return on;
}

// ---------------------------------------------------------------------------
// Segments. "Unattended" is the one where Windcave's installed base matters:
// terminals on chargers, car parks and vending machines, no human at the device.
// ---------------------------------------------------------------------------
export const SEGMENTS = {
  online: {
    label: 'Online checkout',
    ticketMedian: 85,
    ticketSigma: 0.7,
    humanScaRate: 0.25, // share of human payments challenged
    humanScaCompletion: 0.92,
    offlineRate: 0, // no store-and-forward online
  },
  unattended: {
    label: 'Unattended (EV charging, parking, vending)',
    ticketMedian: 14,
    ticketSigma: 0.6,
    humanScaRate: 0, // card-present tap
    humanScaCompletion: 1,
    offlineRate: 0.02, // device offline -> service delivered before authorisation
  },
};

// ---------------------------------------------------------------------------
// Unit economics (NZ$). Gateway revenue and cost per transaction, and the
// merchant's all-in cost of acceptance, which is what decides whether a
// micro-priced product exists at all.
// ---------------------------------------------------------------------------
export const ECONOMICS = {
  gatewayFeePct: 0.0025,
  gatewayFeeFixed: 0.1,
  gatewayUnitCost: 0.035, // processing + scheme-facing cost per authorisation
  merchantCostPct: 0.012,
  merchantCostFixed: 0.25,
  merchantGrossMargin: 0.3, // value of an honest sale to the merchant, as share of ticket
  // Merchants stop offering a price point when acceptance cost eats it.
  // Acceptance probability falls linearly between these two burdens.
  burdenComfort: 0.04,
  burdenWalkaway: 0.12,
  aggregationBatch: 8, // micro-tickets per aggregated authorisation
  // Micropayment pricing: the fixed fee is shared across the batch and replaced by
  // a percentage premium. Without the premium, aggregation hands the fixed fee back
  // on tickets that would have happened anyway (docs/adr/0004).
  aggregationPremiumPct: 0.015,
  aggregationThreshold: 10, // tickets under this are eligible for aggregation
  aggregationSettleFail: 0.012, // batch declined at settle time -> merchant eats it
  chargebackFee: 15,
  decisionCallCost: 0.00002, // one Jev call; launch pricing makes this negligible
  disputeWriteOffLevel: 25, // below this, dispute propensity scales down with ticket
  disputeFloor: 0.3,
  disputeOpsCost: 4, // gateway handling cost per dispute
  refundOpsCost: 2.5, // gateway handling cost per duplicate caught in reconciliation
  // Scheme monitoring. Illustrative thresholds, not a quote of any scheme's rules.
  monitorThreshold: 0.009,
  monitorFeePerDispute: 8,
  suspendThreshold: 0.018,
  suspendRevenueHaircut: 0.25,
};

// ---------------------------------------------------------------------------
// Behaviour: how issuers, agents, humans and attackers act. These are the
// failure points. Each maps to an entry in src/sim/failure-modes.js.
// ---------------------------------------------------------------------------
export const BEHAVIOUR = {
  // Issuer
  issuerDecline: 0.06, // ordinary declines (funds, limits)
  issuerAgentFalseDecline: 0.1, // extra declines when the issuer cannot recognise the agent
  issuerAgentFalseDeclineAttested: 0.015,
  issuerTimeout: 0.008, // response lost; outcome unknown to the caller
  timeoutSucceeded: 0.6, // of lost responses, share where the auth actually went through
  // Upstream latency rises with load. Timeout rate = base * (1 + gain * retries
  // per intent over the recent window). This is the loop that turns a blip into
  // a storm; see the brownout sweep in the report.
  stormGain: 40,
  stormWindow: 400,
  timeoutCeiling: 0.5,
  // Gateway setting, not world behaviour: the breaker opens when more than this
  // share of the last `breakerWindow` issuer answers were timeouts.
  breakerThreshold: 0.025,
  breakerWindow: 200,

  // Agents
  agentMaxRetries: 3,
  agentRotatesKey: 0.35, // "sloppy client": a new idempotency key on each retry
  agentRetryOnDecline: 0.4,
  agentScaRate: 0.35, // challenged when the issuer sees an unattended, unrecognised actor
  agentScaRateDelegated: 0.04,
  agentScaCompletion: 0.12, // someone has to pull a human back in
  agentScaCompletionDelegated: 0.85,
  agentDoubleFire: 0.012, // agent loop replays the purchase call with a fresh key
  protocolUnsupported: 0.55, // agent speaks a dialect the gateway does not
  protocolUnsupportedAdapter: 0.06,

  // Humans
  humanRetry: 0.3,
  humanDisputeRate: 0.0015,

  // Adversaries and accidents
  impersonatorShare: 0.006, // forged mandate: someone pretending to be a user's agent
  driftShare: 0.015, // out-of-scope purchase (prompt injection or misread instruction)
  // Share of drift where the merchant category still matches the mandate (a gift
  // card bought at the supermarket). No rule catches these; only a judgement can.
  semanticDriftShare: 0.5,
  injectionAttempt: 0.3, // bad actors who plant text aimed at the decision model
  decisionDeadlineMs: 400, // gateway setting: how long a payment waits for Jev
  overCapShare: 0.008, // purchase far above the per-transaction cap
  staleMandateShare: 0.02, // agent acting on an expired mandate
  fraudChallengePass: 0.1, // impersonator gets through a challenge
  mandateBudgetMultiple: 14, // mandate total budget, in multiples of the median ticket
  mandatePerTxnMultiple: 6,

  // Risk score separation (fraud ~ N(sep,1), honest ~ N(0,1)). Today's static
  // rule is a fixed threshold on this score for automated traffic: it declines
  // about 8% of honest agents and has no idea what the payment is worth.
  riskSeparation: 1.6,

  // Disputes
  disputeGivenDuplicate: 0.5, // rest are refunded in reconciliation
  disputeGivenFraud: 0.85,
  disputeGivenDrift: 0.45,
  disputeGivenOverBudget: 0.3,
  disputeGivenStale: 0.1,
  humanDisputeLost: 0.7,
  friendlyFraudRate: 0.004, // "I never told my agent to buy that"
  friendlyFraudWinWithEvidence: 0.75,
  friendlyFraudWinWithout: 0.2,
};

// ---------------------------------------------------------------------------
// Priors for the valuation model (src/value). Triangular (low, mode, high).
// ---------------------------------------------------------------------------
export const PRIORS = {
  // Share of today's purchase occasions that are agent-mediated at the horizon.
  agentShare: { online: [0.03, 0.12, 0.35], unattended: [0.02, 0.1, 0.4] },
  // Friction ratio: cost of a purchase decision via an agent / via a human.
  frictionRatio: { online: [0.15, 0.35, 0.7], unattended: [0.1, 0.25, 0.6] },
  // Elasticity of transaction count to friction cost. This is the Jevons term.
  elasticity: { online: [0.1, 0.35, 0.8], unattended: [0.2, 0.6, 1.2] },
  // Share of the extra transactions that is the same spend cut into smaller
  // tickets (1.0) rather than genuinely new spend (0.0).
  fragmentation: { online: [0.3, 0.6, 0.9], unattended: [0.4, 0.75, 0.95] },
  // Share of total volume lost per unit of agent share if the gateway is not
  // agent-ready (merchants move the whole account, not just the agent traffic).
  erosion: [0.0, 0.5, 1.2],
  // Merchant churn per unit of merchant loss rate (losses / GDV).
  churnSensitivity: [4, 12, 30],
  discountRate: [0.08, 0.1, 0.14],
  rampMidpointYear: [1.5, 2.5, 4],
};

// The Jevons multiplier is capped: beyond this the prior is describing a different
// market, not a bigger version of this one.
export const JEVONS_CAP = 8;

export const HORIZON_YEARS = 5;
// The model reports value per this many baseline transactions a year, per segment,
// so nothing here pretends to know Windcave's volume. Scale linearly with yours.
export const BASELINE_TXNS = 100e6;
