# Security

## What this is

A reference implementation and a draft specification. It is not deployed anywhere, it holds no real payment data, and it talks to no card network. A weakness here puts nobody's money at risk today. It does matter, because the point of the project is a receipt that can be trusted.

## What counts

- A receipt that verifies and was not issued by the holder of the gateway key.
- A receipt that was altered and still verifies.
- An inclusion proof that succeeds for a receipt that was not in the log at that root.
- A mandate that verifies and was not signed by the registered principal.
- Two different states, question sets or mandates that commit to the same hash.
- Text from an agent or merchant reaching the model's state when the hygiene guard is on.
- Money created or destroyed in the ledger.

## How to report

Use GitHub's private reporting: the **Security** tab of this repository, then **Report a vulnerability**. Include the smallest input that shows the problem. A failing test is ideal.

You will get a reply from the maintainer. Once it is fixed, the finding is written up in the open, credited to you unless you would rather it was not, and added to the failure-mode register if it belongs there.

## What does not need the private route

A way the design loses money, a guard that does not hold under some condition, a gap in the spec. Those are what the project is for. Open a failure mode issue, in public, and see [`CONTRIBUTING.md`](CONTRIBUTING.md).
