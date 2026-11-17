# The thesis

*Independent work. Not affiliated with Windcave or TypeSafe AI. Jev's behaviour is measured from 234 real API calls on synthetic labelled payments. Every other number is a stated prior in `src/assumptions.js` or `src/value/thesis.js`. Market figures are in US dollars because their sources are; the gateway model is in NZ dollars.*

## What this is for

Making human-to-human transactions more valuable, more personable and more secure.

An agent may carry the payment, but there is still a person who asked for something at one end and a person who provided it at the other. When software stands between them, three things are at risk: that the purchase is not what the first person meant, that the second person is not paid for what they provided, and that neither can show afterwards what was agreed. The rest of this document is about closing those three gaps, and about what closing them is worth.

## The claim

There is a gap in the rules of card payments, and it is open right now. When an agent buys something its human did not mean it to buy, no card network rule says who pays. The party that can produce proof, made at the time of the payment, of what the human authorised and that the purchase was checked against it, wins those disputes today and is positioned to define the evidence standard when the rules are written.

That proof is a small, specific piece of technology: a **conformance receipt**. This repo builds one, on top of a working pipeline and a real System One model, and prices what it is worth.

It is worth a billion dollars in about one world in twenty. This document says which worlds, and what moves the odds.

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

**A model that answers in a form a receipt can hold.** Jev is a System One model. It takes a state and typed questions and returns a probability for each, in about a tenth of a second, without generating text. Its Noul primitive answers one yes/no question with one number. A number from a pinned model version, about a hashed state, is something you can sign. A paragraph from a chat model is not.

**A party that sees the outcome.** Calibrating a model's probabilities needs to know what happened afterwards, and only the acquirer side of a payment sees the dispute. Measured on 234 payments, Jev ranks borderline purchases well (AUC 0.966) and its probabilities are underconfident by a factor of about 2.2. Used as stated they complete no more honest payments than a static rule. Recalibrated against outcomes they complete 83% against 78%. The model vendor cannot do that recalibration. The gateway can. That asymmetry is the moat, and it compounds with volume.

## Why Windcave in particular

Most of the industry conversation is about agents at an online checkout. Windcave also runs payments where no human is present at all: its site describes online, in-store and unattended payments, with unattended devices across parking, vending and EV charging.

Unattended is where an agent payer arrives first and where a challenge is impossible, so the decision has to be made by the acceptor, at the device, in the moment. It is also a segment the large online processors are not built around. A standard is easier to establish in a niche you already hold than in a market someone else owns.

## The numbers

**On one gateway's own traffic.** Storm-proofing, then agent-ready rails, then the mandate layer is worth NZ$13.7m over five years per 100M baseline transactions a year in each segment, and it is the best of sixteen options in 86% of simulated worlds. Rails without the rest lose money in 85%. This is the part that pays for itself whatever happens next, and it is not the billion.

**What the stack does to losses.** Merchant losses from disputes about authorisation or scope, in basis points of agent volume:

| | Claims |
|---|---:|
| Today's gateway | 478 bps |
| Agent-ready rails only | 480 bps |
| Full stack, today's rules | 38 bps |
| Full stack, receipts recognised by the rules | 12 bps |

A loss rate of 478 basis points cannot be insured. One of 12 can. A guarantee priced at 40 basis points is a business in the last row and not in the one above it.

**Beyond one gateway.** Two engines scale with other people's payments: a fee per receipt, and a fee for carrying agent-dispute losses on receipted payments. Both turn on the share of the world's agent payments that carry this receipt, which nobody knows. Across 20,000 simulated worlds:

| | Median value | 90th percentile | Worth US$100m or more | Worth US$1bn or more |
|---|---:|---:|---:|---:|
| All worlds | US$34m | US$494m | 31% | 4.8% |
| Rules come to recognise receipts | US$181m | US$1.1bn | 67% | 11.8% |
| Rules stay as they are | US$12m | US$76m | 7% | 0.0% |

With every other input at its mode, a billion needs about **1.6 billion receipted agent payments a year**, in a world where the rules recognise them. That is 13% of a US$1tn agent-commerce market, or 4% of a US$3tn one. Under today's rules it is not reachable at any market size I consider plausible.

## What moves the odds

The table above is a decision, not a forecast. Three things move a gateway from the bottom row towards the middle one, and none of them is more code.

1. **Get the receipt recognised.** The value is in the rules. An open specification, offered to the schemes while their agent dispute rules are unwritten, is worth more than a proprietary format. This is standards work with Visa, Mastercard and issuers.
2. **Hold a segment first.** Issue receipts on every unattended agent payment and publish the dispute outcomes. A standard that already carries real volume in one segment is harder to ignore than a proposal.
3. **Build the outcome record.** Every receipted payment that is later disputed, or is not, sharpens the calibration. This is the asset that does not transfer with the code.

## What this has in common with things that were bought

Payment primitives have been acquired at these prices: Mastercard paid US$850m for Ekata (identity verification, 2021) and US$825m for Finicity (open-banking data access, 2020). Stripe paid US$1.1bn for Bridge (stablecoin settlement, 2024). Mastercard agreed up to US$1.8bn for BVNK (2026). Each was a narrow capability that a network needed at the moment its rules or rails were changing.

Those prices show the range that exists for a primitive at the right moment. They do not show that this is one. What they have in common with the receipt is timing: the capability mattered because the rules were moving.

## What would kill it

- **The networks build it themselves.** This is the most likely outcome. Visa and Mastercard already issue agent tokens and can define their own evidence format. The receipt then becomes a feature of their programmes, and the gateway's value is in issuing good ones, which is the own-traffic number and not the billion.
- **The mandate standard absorbs it.** Google's AP2 already defines signed mandates. A mandate proves what was authorised. A receipt proves the acceptor checked the purchase against it. If the protocols add that step, the receipt is a field in someone else's message.
- **Rules go the other way.** If liability for agent error is fixed on the cardholder or the agent's operator regardless of evidence, the guarantee has nothing to underwrite.
- **The model is not good enough on real disputes.** 0.966 is on payments I wrote. A weak model (AUC 0.76) makes the decision layer worth less than the rule it replaces.
- **Adoption is slower than every forecast.** The published 2030 forecasts for agent commerce differ by a factor of twenty.

## What to build, and in what order

| Step | Bet | Marginal value (NZ$) |
|---|---|---:|
| 1 | Storm-proofing: intent-derived idempotency, definitive answers on timeout, a circuit breaker | +$2.3m |
| 2 | Agent-ready rails: one adapter for the agent checkout protocols, agent credentials, delegated authentication | +$4.6m |
| 3 | Mandate layer: verify the mandate, two Nouls behind a guard, a conformance receipt for every decision | +$6.9m |
| Hold | Micro-settlement | −$1.8m |

Steps 1 to 3 are justified on one gateway's own traffic. The receipt costs almost nothing to add at step 3, and it is the only part with a tail.

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

It is not a forecast, and it does not know Windcave's volumes, margins or roadmap, or how Jev performs on real disputes. The billion-dollar figure is a probability under priors I chose, and a different person would choose different ones. The priors are in one file and the whole thing re-runs in about a minute.

## Sources and facts to verify

**Rules.** The description of network rules comes from merchant-facing commentary, not from the rulebooks, and the sources disagree with each other on how Visa's text should be read. Check the Visa Core Rules and Mastercard documents before relying on any of it.

- https://www.swell.is/content/ai-agent-orders-fraud-chargebacks
- https://www.chargeflow.io/blog/ai-agent-chargeback-liability
- https://banksandbankers.com/agentic-commerce-liability-gap-fraud-vs-agent-error/
- https://www.chargemate.tech/articles/agentic-commerce-chargebacks

**Market size.** Morgan Stanley puts agent-executed purchases at US$190bn to US$385bn of US e-commerce by 2030. Bain says US$300bn to US$500bn on a broader definition. McKinsey says US$3tn to US$5tn globally for revenue orchestrated by agents. I read these through secondary reporting and did not open the originals. My prior for year five is US$0.3tn to US$3tn.

- https://morganstanley.com/insights/articles/agentic-commerce-market-impact-outlook
- https://www.digitalcommerce360.com/2025/12/22/bain-agentic-ai-us-ecommerce-sales-2030/
- https://stellagent.ai/insights/agentic-commerce-market-size-forecast-2030

**Acquisitions.** Ekata, Finicity and Bridge prices are as widely reported. BVNK is reported as US$1.5bn plus contingent payments.

- https://www.paymentsjournal.com/mastercard-to-acquire-ekata-to-advance-digital-identity-efforts/
- https://www.spglobal.com/market-intelligence/en/news-insights/research/2026/03/mastercards-1-8-b-bet-on-bvnk-accelerates-stablecoin-push

**Windcave.** From its public site as surfaced in web search (`windcave.com`, `windcave.com/unattended-payments`). I could not load those pages directly, so the wording is deliberately general.

**Jev.** Request and response shapes were checked against `docs.typesafe.ai` on 16 November 2026, and the client was run against the live API: 234 calls to `jev-1.14.0`, all answered. Results are in `docs/jev-measured.json`. Latency and price figures beyond my own measurement are vendor-reported.
