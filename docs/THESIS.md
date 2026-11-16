# The argument, in one page

*Independent work. Not affiliated with Windcave or TypeSafe AI. Figures are from the model in this repo, per 100M baseline transactions a year in each segment, and rest on the priors in `src/assumptions.js`. The decision model in the simulations is a stand-in; nothing here measures Jev.*

## The claim

Agentic commerce is usually sized as today's transactions with a different payer. For a gateway that undercounts the upside and misses most of the risk. An agent takes most of the effort out of a purchase, so people buy more often and in smaller amounts, and every one of those purchases is made by software that retries instantly, cannot answer a challenge, and acts on an instruction a human gave some time ago.

A gateway earns per transaction, so more transactions is the opportunity. A gateway also carries the per-transaction failures, so more transactions from that kind of payer is the exposure. The useful question is which of the two grows faster under each thing you could build.

## Where a decision model belongs

Nearly everything about an agent payment can be checked. A signature verifies or it does not. A cap is exceeded or it is not. Rules are the right tool for those, and a model should never be asked.

One question has no rule. An agent told to do the weekly shop buys a $50 gift card at the supermarket. The merchant category matches the mandate, the amount is under the cap, and the cardholder will dispute it. Someone has to judge whether that purchase is what the human meant, on every payment, inside a few hundred milliseconds.

That is what Jev is shaped for. It takes a state and typed questions and returns a probability for each, without generating text. In this design it does one job: it estimates. The gateway's own expected-value rule turns the estimate into approve, challenge or decline, using the ticket, the merchant's margin and the cost of a chargeback, which are the gateway's numbers and nobody else's.

Keeping those apart is what makes the model replaceable, auditable and safe to be wrong. It also makes its value measurable. Against a static rule the decision layer is worth about +$0.9m here, and nearly all of that comes from honest agent payments it no longer declines.

## Why this fits Windcave in particular

Most of the industry conversation is about agents at an online checkout. Windcave also runs payments where no human is present at all: its site describes online, in-store and unattended payments, with unattended devices across parking, vending and EV charging.

That matters for two reasons.

**The Jevons effect is strongest where friction is highest.** Paying at a charger, a car park or a vending machine means stopping, finding a card, and tapping a device. A vehicle or an assistant paying on the driver's behalf removes all of it. My prior for volume elasticity is higher for unattended than for online (0.6 against 0.35), and the model's most interesting option (micro-settlement) lives entirely in that segment.

**The failure modes are already familiar there.** An unattended estate already deals with offline devices, service delivered before authorisation, and nobody available to answer a challenge. An agent payer is a new instance of a problem this business already knows how to think about. For a pure e-commerce processor it is a new problem.

## What to build, and in what order

| Step | Bet | What it is | Marginal value |
|---|---|---|---:|
| 1 | Storm-proofing | Derive idempotency from the purchase, not from the client's key. Answer timeouts definitively. Cut retries off when the issuer is struggling. | +$2.3m |
| 2 | Agent-ready rails | One adapter for the agent checkout protocols, agent credentials, delegated authentication. | +$4.6m |
| 3 | Mandate layer | Verify what the human authorised. Let Jev judge what rules cannot, behind a guard. Keep the mandate as evidence. | +$7.1m |
| Hold | Micro-settlement | Aggregate small tickets into one authorisation, with micropayment pricing. | −$1.0m |

Storm-proofing goes first because it is cheap, it improves the gateway's net on today's human traffic before a single agent arrives, and it did not lose money in any of 4,000 simulated worlds. It also makes step 2 safe. Rails without it turn an issuer brownout into a 14.3% duplicate-charge rate.

Rails and the mandate layer should be planned as one programme. Separately they are worth −$4.4m and −$1.0m. Together they are worth $11.0m more than that sum, because rails bring the volume in and the mandate layer is what makes the volume clean.

Micro-settlement waits. It pays when unattended volume elasticity passes about 1.04, and my prior mode is 0.6. A pilot with a few charging or parking operators would measure it directly.

## How I would bring Jev in

1. **Shadow mode first.** Send it real payments, act on none of its answers, and keep what it said next to what later happened. Two numbers come out: its AUC on this gateway's own disputes, and how often it answers inside the deadline.
2. **Guard before go-live.** A deadline with a fallback to the existing rule, a pinned model version, recalibration against observed outcomes, and no untrusted text in the state. Without the fallback, a one-in-five outage takes completed agent payments from 84% to 65%.
3. **Start where a wrong answer is cheap.** Small unattended tickets, where a challenge is impossible anyway and a wrong approval costs a few dollars.

## What I would want to know from you

The model is built so that its inputs can be replaced. These are the ones the answer depends on, in order:

1. What share of online purchase volume is already arriving through agents or automation, and how fast is that moving?
2. How many merchants would move their whole account to a gateway that supports agent checkout, and not only their agent traffic?
3. What does the timeout and retry profile look like against the issuers and hosts you connect to?
4. What does today's rule decline that it should not? That false-decline rate is most of what a decision model is worth.

Build cost is not on the list. Across the range I assumed, it barely moves the decision.

## What this is not

It is not a forecast, and it does not know Windcave's volumes, margins or roadmap, or how good Jev is at payments. It is a way of making the decision explicit enough to argue with: every assumption is in one file, every failure mode has a price, and changing either re-runs the whole thing in about a minute.

## Sources and facts to verify

**Windcave.** The description of its business comes from its public site as surfaced in web search (`windcave.com`, `windcave.com/unattended-payments`). I could not load those pages directly from the environment this was built in, so the wording above is deliberately general. Check it against the live pages before relying on it.

**Jev.** Launched in early access by TypeSafe AI in September 2026. The description here (state plus typed questions in, probabilities out, tens to hundreds of milliseconds, the `noul` yes/no type, `jev-latest` and `jev-1.13`) comes from launch coverage and third-party tutorials. Latency and cost figures are vendor-reported. I could not reach `docs.typesafe.ai` from the build environment, so the client in `src/decision/jev-client.js` should be checked against the primary API reference before use.

- https://typesafe.ai/
- https://docs.typesafe.ai/introduction
- https://www.theneuron.ai/explainer-articles/typesafe-jev-system-one-models-explained/
- https://www.truefoundry.com/blog/typesafe-ai-jev
- https://beam.ai/agentic-insights/jev-typesafe-ai-agents

**Agent-payment protocols.** OpenAI and Stripe's ACP, Google's AP2 and UCP, Visa's Trusted Agent Protocol and Mastercard Agent Pay are described from secondary sources that disagree on dates and details. The model does not depend on which of them wins, only on the fact that there are several and they do not interoperate.

- https://www.adyen.com/en_AU/knowledge-hub/agentic-commerce-control
- https://atxp.ai/blog/mastercard-agent-pay-stripe-acp-visa-x402-comparison-2026
- https://stellagent.ai/insights/mcp-vs-a2a-vs-ap2-protocol-comparison
