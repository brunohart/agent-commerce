# 0001. Value the bets by expected value with a Jevons term

**Status:** accepted

## Context

The question is which agentic-commerce capabilities a gateway should build. The usual tool is a business case: pick an adoption curve, multiply by a take rate, subtract cost. That treats agent payments as today's transactions with a different payer, and it treats each capability as independent of the others.

Both assumptions are wrong in ways that change the answer. Agents change the number and size of transactions, and the capabilities are complements.

## Decision

Value every option by **expected value with a Jevons volume term**. (This is the valuation of what to build. The decision model inside the pipeline is Jev; see [0006](0006-jev-estimates-the-gateway-decides.md).)

- *Expected value*, because the inputs are uncertain and a single scenario hides that. Every prior is a triangular distribution and every portfolio is evaluated across 4,000 draws.
- *Jevons-adjusted*, because lowering the cost of a purchase raises the number of purchases. Count scales with `frictionRatio ^ −elasticity`, and ticket size falls as a share of that growth is the same spend cut smaller.
- *Against doing nothing in the same world*. Every portfolio and the do-nothing case are evaluated on the same draw, so a difference between two options is a difference between decisions.

Report the mean, the 5th and 95th percentiles, the probability of losing money, and the probability of being the best option. Also report plain expected value with the Jevons term switched off, so the effect of the adjustment is visible.

## Consequences

- Rails alone are −$1.0m under plain EV and −$4.4m with the Jevons term. Micro-settlement moves the other way. The adjustment changes the size and sometimes the sign of an answer, which is the test of whether it is worth having.
- The model needs a per-transaction margin that responds to traffic mix and ticket size. That is what the simulator is for ([0003](0003-simulate-then-decide.md)).
- Elasticity is the least knowable input. It is capped (`JEVONS_CAP` in `src/assumptions.js`) and it is the subject of the break-even analysis, so the model says at what value the answer flips.
- Triangular priors are crude. They are also easy for someone else to argue with and replace, which matters more here than distributional accuracy.
