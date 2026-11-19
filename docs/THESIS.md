# The thesis

*Independent work. Not affiliated with Windcave or TypeSafe AI. Jev's behaviour is measured from 234 real API calls on synthetic labelled payments. Every other number is a stated prior in `src/assumptions.js`.*

## What this is for

Making human-to-human transactions more valuable, more personable and more secure.

An agent may carry the payment, but there is still a person who asked for something at one end and a person who provided it at the other. When software stands between them, three things are at risk: that the purchase is not what the first person meant, that the second person is not paid for what they provided, and that neither can show afterwards what was agreed. The rest of this document is about closing those three gaps.

## The claim

There is a gap in the rules of card payments, and it is open right now. When an agent buys something its human did not mean it to buy, no card network rule says who pays. The party that can produce proof, made at the time of the payment, of what the human authorised and that the purchase was checked against it, wins those disputes today and is well placed when the rules are written.

That proof is a small, specific piece of technology: a **conformance receipt**. This repo builds one, on top of a working pipeline and a real System One model, and measures what it does.

## The gap

As of late 2026, neither Visa nor Mastercard has published a binding rule that allocates liability for a purchase where the agent, not a fraudster, made the mistake. Disputes about agent purchases run through existing reason codes. Commentary on Visa's April 2026 Core Rules reads them as making the cardholder responsible for an agent's actions as if they had made the purchase themselves, and as adding agent wording to its compelling-evidence provisions. Mastercard's position follows its tokenised-transaction rules. In practice the merchant usually absorbs the loss, because the merchant cannot show what the customer told the agent to do.

Three things follow. The loss is real and lands on merchants. Evidence decides who carries it. And the format of that evidence has not been set.

## The primitive

A conformance receipt is a signed record, issued by the gateway at authorisation, that binds together:

- the mandate the human signed,
- the exact state and questions a pinned model was asked, as hashes,
- what the model answered and what the gateway did with it.

Receipts go into an append-only Merkle log whose root is published. A receipt cannot be altered, and one that was not in the log on the day cannot be produced later. It carries hashes and not payment details, so it reveals nothing until the gateway chooses to reveal the state in a dispute. The format is specified in [`RECEIPT-SPEC.md`](RECEIPT-SPEC.md) and implemented in `src/receipt/`.

Two things make this possible now and not two years ago.

**A model that answers in a form a receipt can hold.** Jev is TypeSafe's System One model. It takes a state and typed questions, called primitives, and returns a typed answer with a probability for each, in about a tenth of a second, without generating text. The primitive used here is the Noul, a yes/no question whose answer is the probability of yes. A number from a pinned model version, about a hashed state, is something you can sign. A paragraph from a chat model is not.

**A party that sees the outcome.** Calibrating a model's probabilities needs to know what happened afterwards, and only the acquirer side of a payment sees the dispute. Measured on 234 payments, Jev ranks borderline purchases well (AUC 0.966) and its probabilities are underconfident by a factor of about 2.2. Used as stated they complete no more honest payments than a static rule. Recalibrated against outcomes they complete 83% against 78%. The model vendor cannot do that recalibration. The gateway can, and it gets better at it with every payment it sees through to the end.

## Why Windcave in particular

Most of the industry conversation is about agents at an online checkout. Windcave also runs payments where no human is present at all: its site describes online, in-store and unattended payments, with unattended devices across parking, vending and EV charging.

Unattended is where an agent payer arrives first and where a challenge is impossible, so the decision has to be made by the acceptor, at the device, in the moment. It is also a segment the large online processors are not built around. An unattended estate already deals with offline devices, service delivered before authorisation, and nobody available to answer a challenge. An agent payer is a new instance of a problem this business already knows how to think about.

## What it does

**For the people in the transaction.** With the full stack, 83% of honest agent payments complete, against 78% under today's static rule. A purchase that passes every rule and is still not what the person meant, such as a prepaid Visa card bought under a mandate for the weekly shop, is stopped: Jev put that one at 0.92.

**For merchants.** Losses from disputes about authorisation or scope, in basis points of agent volume:

| | Claims |
|---|---:|
| Today's gateway | 478 bps |
| Agent-ready rails only | 480 bps |
| Full stack, today's rules | 38 bps |
| Full stack, receipts recognised by the rules | 12 bps |

**For the gateway.** Storm-proofing, then agent-ready rails, then the mandate layer is worth NZ$13.7m over five years per 100M baseline transactions a year in each segment, and it is the best of sixteen options in 86% of simulated worlds. Rails without the rest lose money in 85%.

## What to build, and in what order

| Step | Bet | Marginal value (NZ$) |
|---|---|---:|
| 1 | Storm-proofing: intent-derived idempotency, definitive answers on timeout, a circuit breaker | +$2.3m |
| 2 | Agent-ready rails: one adapter for the agent checkout protocols, agent credentials, delegated authentication | +$4.6m |
| 3 | Mandate layer: verify the mandate, two Nouls behind a guard, a conformance receipt for every decision | +$6.9m |
| Hold | Micro-settlement | −$1.8m |

Storm-proofing goes first because it is cheap, it improves the gateway's net on today's human traffic before a single agent arrives, and it did not lose money in any of 4,000 simulated worlds. Rails and the mandate layer should be planned as one programme: separately they are worth −$4.4m and −$1.1m, and together $12.0m more than that sum. The receipt costs almost nothing to add at step 3.

## What would make the receipt matter beyond one gateway

A receipt that only its issuer can read is a better filing system. It matters to anyone else only if the rules come to recognise it, and three things work towards that.

1. **Offer it openly.** An open specification, put in front of the schemes while their agent dispute rules are unwritten, is worth more than a proprietary format.
2. **Hold a segment first.** Issue receipts on every unattended agent payment and publish the dispute outcomes. A format that already carries real volume in one segment is harder to ignore than a proposal.
3. **Build the outcome record.** Every receipted payment that is later disputed, or is not, sharpens the calibration. This is the part that does not transfer with the code.

## What would stop it

- **The networks build it themselves.** This is the most likely outcome. Visa and Mastercard already issue agent tokens and can define their own evidence format. The receipt then becomes a feature of their programmes, and the gateway's part is issuing good ones.
- **The mandate standard absorbs it.** Google's AP2 already defines signed mandates. A mandate proves what was authorised. A receipt proves the acceptor checked the purchase against it. If the protocols add that step, the receipt is a field in someone else's message.
- **Rules go the other way.** If liability for agent error is fixed on the cardholder or the agent's operator regardless of evidence, the receipt changes less.
- **The model is not good enough on real disputes.** 0.966 is on payments I wrote. A weak model (AUC 0.76) makes the decision layer worth less than the rule it replaces.

## Bringing Jev in

1. **Shadow mode.** I have done the version an outsider can: 234 synthetic payments, scored. The real version sends live payments, acts on none of the answers, and keeps what Jev said next to what later happened.
2. **Guard before go-live.** A deadline with a fallback to the existing rule, a pinned model version, recalibration against outcomes, and no untrusted text in the state. Without the fallback, a one-in-five outage takes completed agent payments from 83% to 65%. Without recalibration, Jev's underconfidence takes them to 78%.
3. **Start where a wrong answer is cheap.** Small unattended tickets, where a challenge is impossible anyway.

## What I would want to know from you

1. What share of your volume is already arriving through agents or automation, and how fast is that moving?
2. What does today's rule decline that it should not? That false-decline rate is most of what a decision layer is worth.
3. What do agent-related disputes look like in your data today, and how many does the merchant win?
4. Who at the schemes is writing the agent dispute rules, and is the evidence format on the table?

## What this is not

It is not a forecast, and it does not know Windcave's volumes, margins or roadmap, or how Jev performs on real disputes as opposed to the payments I wrote. The receipt has no standing with any card network. Every assumption is in one file, every failure mode has a price, and changing either re-runs the whole thing in about a minute.

## Sources and facts to verify

**Rules.** The description of network rules comes from merchant-facing commentary, not from the rulebooks, and the sources disagree with each other on how Visa's text should be read. Check the Visa Core Rules and Mastercard documents before relying on any of it.

- https://www.swell.is/content/ai-agent-orders-fraud-chargebacks
- https://www.chargeflow.io/blog/ai-agent-chargeback-liability
- https://banksandbankers.com/agentic-commerce-liability-gap-fraud-vs-agent-error/
- https://www.chargemate.tech/articles/agentic-commerce-chargebacks

**Windcave.** From its public site as surfaced in web search (`windcave.com`, `windcave.com/unattended-payments`). I could not load those pages directly, so the wording is deliberately general.

**Jev.** Request and response shapes were checked against `docs.typesafe.ai` on 16 November 2026, and the client was run against the live API: 234 calls to `jev-1.14.0`, all answered. Results are in `docs/jev-measured.json`. Latency and price figures beyond my own measurement are vendor-reported.

**Agent-payment protocols.** OpenAI and Stripe's ACP, Google's AP2 and UCP, Visa's Trusted Agent Protocol and Mastercard Agent Pay are described from secondary sources that disagree on dates and details.

- https://atxp.ai/blog/mastercard-agent-pay-stripe-acp-visa-x402-comparison-2026
- https://stellagent.ai/insights/mcp-vs-a2a-vs-ap2-protocol-comparison
