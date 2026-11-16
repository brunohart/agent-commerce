# 0003. Simulate first, then decide on a response surface

**Status:** accepted

## Context

The decision model needs a margin per purchase intent for each combination of bets. Two ways to get one:

1. Assume it. Write down a loss rate per failure mode and subtract.
2. Measure it. Run a pipeline with those failure modes injected and see what is left.

Assumed loss rates cannot represent the thing that matters most, which is failures causing other failures. A timeout causes a retry, the retry causes load, load causes timeouts. No single rate in a spreadsheet captures that.

Measuring has a cost. The Monte Carlo makes 4,000 draws across 16 portfolios, and a simulation per draw would take hours.

## Decision

Run the simulator once per portfolio over a grid of the two variables the Jevons term moves, agent share and ticket size, for each segment. Store net per intent and merchant loss rate at each point. Inside the Monte Carlo, interpolate.

- Grid: agent share `[0, 0.15, 0.4, 0.8]` by ticket factor `[1, 0.6, 0.3]`, three seeds each.
- Bilinear interpolation, clamped at the edges.

## Consequences

- The whole report regenerates in about a minute, so changing an assumption and seeing the result is one command.
- The cliff is a step function and bilinear interpolation smooths it. Averaging seeds turns the step into a probability, which is closer to how it behaves across a real merchant portfolio, but the surface is coarse near the threshold.
- Behavioural parameters (retry counts, fraud shares) are fixed across the Monte Carlo. Only the market priors vary. Varying both would need a much larger surface.
- The ledger asserts its invariants at the end of every simulation. That check caught a real bug during development: the late-response queue held a reference to a request object the caller went on to mutate, and two captures were posted under one payment id.
