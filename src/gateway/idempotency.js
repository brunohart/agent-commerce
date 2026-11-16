// Idempotency is the control that turns "I don't know if that worked" into a safe
// retry. Humans retry once, slowly, from the same form. Agents retry immediately,
// several times, and a meaningful share of client code mints a fresh key per attempt,
// which defeats client-supplied idempotency entirely.
//
// Two modes:
//   client  - honour the key the caller sent (what most gateways do today)
//   intent  - derive the key from what is being bought: mandate + cart + merchant.
//             A retry of the same intent collapses to one payment whatever key the
//             client sent.

import { createHash } from 'node:crypto';

export function intentKey(req) {
  return createHash('sha256')
    .update([req.mandate?.id ?? req.payerId, req.merchantId, req.cartId, req.amount.toFixed(2)].join('|'))
    .digest('hex')
    .slice(0, 24);
}

export function fingerprint(req) {
  return [req.merchantId, req.cartId, req.amount.toFixed(2)].join('|');
}

export class IdempotencyStore {
  constructor() {
    this.entries = new Map();
  }

  /**
   * Begin a request. Returns one of:
   *   { kind: 'new' }                      proceed, then call complete()
   *   { kind: 'replay', result }           same request seen and finished
   *   { kind: 'in_flight' }                same request still running
   *   { kind: 'conflict' }                 same key, different payload
   */
  begin(key, print) {
    const hit = this.entries.get(key);
    if (!hit) {
      this.entries.set(key, { print, state: 'in_flight', result: null });
      return { kind: 'new' };
    }
    if (hit.print !== print) return { kind: 'conflict' };
    if (hit.state === 'in_flight') return { kind: 'in_flight' };
    return { kind: 'replay', result: hit.result };
  }

  complete(key, result) {
    const hit = this.entries.get(key);
    if (hit) {
      hit.state = 'done';
      hit.result = result;
    }
  }

  // A request whose outcome is unknown (issuer timeout) must not be released:
  // releasing it lets the retry through and that is the duplicate charge.
  // It stays in_flight until reconciliation resolves it.
  resolve(key, result) {
    this.complete(key, result);
  }
}
