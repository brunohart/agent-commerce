# 0004. Micro-settlement needs its own pricing

**Status:** accepted

## Context

Agents make small purchases viable for the buyer. They do not make them viable for the merchant. At a $2 ticket a fixed acceptance cost of 25c is a 12.5% burden, and the merchant simply does not offer the price point. The volume the Jevons term predicts never reaches the gateway (failure mode F12).

Aggregation fixes the merchant's side: batch several small tickets into one scheme-facing authorisation and the fixed cost is shared.

## What happened

The first implementation shared the gateway's fixed fee across the batch as well. It seemed like the natural reading of "aggregate".

Micro-settlement then lost money in **every** simulated world, including the ones with high elasticity. The gateway recovered some lost volume and gave back most of its fee on every small ticket that would have happened anyway.

## Decision

Price aggregated tickets the way micropayments are generally priced: a lower fixed component and a higher percentage.

- Fixed fee shared across the batch.
- Percentage premium of 1.5% on aggregated tickets (`aggregationPremiumPct`).
- The merchant's burden is computed with the premium included, so the model does not pretend the merchant gets it free.

## Consequences

- Micro-settlement becomes a real option, and still a losing one on my priors. It is the best portfolio in about 9% of worlds, and within my prior range for unattended elasticity it does not break even.
- It is still not in the recommended build. The trigger is measurable in a pilot, and that is cheaper than building on a guess.
- Aggregation introduces its own failure mode (F13: the batch is declined at settlement after the goods are delivered). It is in the register with no mitigation.
- The premium is one number I chose. Its right value is a commercial question, and the model would be a reasonable place to explore it.
