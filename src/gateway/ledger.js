// Double-entry ledger. Every money movement is a balanced set of postings, and the
// simulator asserts the invariants after every run. If a failure cascade ever makes
// money appear or vanish, this is where it shows up, as a thrown error rather than
// as a reconciliation break three weeks later.

// Tenths of a cent: micro-ticket fees are fractions of a cent and must not round away.
const units = (x) => Math.round(x * 1000);

export class Ledger {
  constructor() {
    /** @type {Map<string, number>} account -> balance in tenths of a cent */
    this.balances = new Map();
    /** @type {Map<string, {authorised:number, captured:number, refunded:number}>} */
    this.payments = new Map();
    this.entries = 0;
  }

  post(postings) {
    let sum = 0;
    for (const [, amount] of postings) sum += amount;
    if (sum !== 0) throw new Error(`unbalanced entry: ${JSON.stringify(postings)}`);
    for (const [account, amount] of postings) {
      this.balances.set(account, (this.balances.get(account) ?? 0) + amount);
    }
    this.entries++;
  }

  authorise(paymentId, amount) {
    if (this.payments.has(paymentId)) throw new Error(`duplicate payment id ${paymentId}`);
    this.payments.set(paymentId, { authorised: units(amount), captured: 0, refunded: 0 });
  }

  capture(paymentId, amount, fee) {
    const p = this.payments.get(paymentId);
    if (!p) throw new Error(`capture without authorisation: ${paymentId}`);
    const a = units(amount);
    const f = units(fee);
    if (p.captured + a > p.authorised) throw new Error(`capture exceeds authorisation: ${paymentId}`);
    p.captured += a;
    this.post([
      ['cardholder_receivable', a],
      ['merchant_payable', -(a - f)],
      ['fee_revenue', -f],
    ]);
  }

  refund(paymentId, amount) {
    const p = this.payments.get(paymentId);
    if (!p) throw new Error(`refund without payment: ${paymentId}`);
    const a = units(amount);
    if (p.refunded + a > p.captured) throw new Error(`refund exceeds capture: ${paymentId}`);
    p.refunded += a;
    this.post([
      ['merchant_payable', a],
      ['cardholder_receivable', -a],
    ]);
  }

  // Sum of all balances is zero, and no payment is captured or refunded beyond
  // what was authorised or captured.
  assertInvariants() {
    let total = 0;
    for (const v of this.balances.values()) total += v;
    if (total !== 0) throw new Error(`ledger out of balance by ${total} (tenths of a cent)`);
    for (const [id, p] of this.payments) {
      if (p.captured > p.authorised || p.refunded > p.captured) {
        throw new Error(`payment ${id} violates capture/refund bounds`);
      }
    }
    return true;
  }
}
