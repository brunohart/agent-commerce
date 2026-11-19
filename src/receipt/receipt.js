// The conformance receipt.
//
// A Noul answered inside a gateway helps that gateway decide. It helps nobody else,
// and it is gone the moment the payment clears. The receipt is what turns the
// decision into something that outlives it: a signed record, issued at
// authorisation, that binds together
//
//   the mandate the human signed,
//   the exact state and questions the model was asked (as hashes),
//   the pinned model that answered and what it said,
//   the calibration applied, and the action the gateway took.
//
// Today no card network rule says who is liable when an agent buys the wrong thing.
// Disputes are won or lost on proving what the customer authorised the agent to do.
// A receipt is that proof, made at the time and not reconstructed afterwards.
//
// Two properties matter:
//   commit now, reveal later   The receipt carries hashes, not the payment's
//                              details. In a dispute the gateway reveals the state
//                              and anyone can check it against the hash.
//   cannot be made up later    Receipts go into an append-only Merkle log
//                              (log.js). A receipt that is not in the log at the
//                              root published that day did not exist that day.

import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';

// Stable JSON: keys sorted at every level, so two parties hash the same bytes.
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function createGatewayKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

/**
 * @param {Object} o
 * @param {{privateKey: object}} o.key           The gateway's signing key.
 * @param {string} o.paymentId
 * @param {number} o.issuedAt
 * @param {object} o.wire                        The request sent to Jev (model, state, questions).
 * @param {{stated: object, p: object, version: string}} o.answer   What came back, and after recalibration.
 * @param {{action: string, ev: object}} o.decision
 * @param {{id: string, signature: string}} o.mandate
 */
export function issueReceipt({ key, paymentId, issuedAt, wire, answer, decision, mandate }) {
  const body = {
    v: 1,
    paymentId,
    issuedAt,
    mandate: { id: mandate.id, signatureHash: sha256(mandate.signature) },
    model: answer.version,
    stateHash: sha256(stable(wire.state)),
    questionsHash: sha256(stable(wire.questions)),
    stated: answer.stated,
    calibrated: answer.p,
    action: decision.action,
    ev: decision.ev,
  };
  return { ...body, signature: sign(null, Buffer.from(stable(body)), key.privateKey).toString('base64') };
}

/**
 * Verify a receipt. With only the public key this checks that the gateway issued
 * it and nothing has been altered. Pass `wire` and/or `mandate` (revealed in a
 * dispute) to also check they are the ones the receipt committed to.
 */
export function verifyReceipt(receipt, publicKeyPem, { wire, mandate } = {}) {
  const { signature, ...body } = receipt;
  let signed = false;
  try {
    signed = verify(null, Buffer.from(stable(body)), publicKeyPem, Buffer.from(signature ?? '', 'base64'));
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, reason: 'bad_signature' };
  if (wire) {
    if (sha256(stable(wire.state)) !== body.stateHash) return { ok: false, reason: 'state_mismatch' };
    if (sha256(stable(wire.questions)) !== body.questionsHash) return { ok: false, reason: 'questions_mismatch' };
    if (wire.model !== body.model) return { ok: false, reason: 'model_mismatch' };
  }
  if (mandate) {
    if (mandate.id !== body.mandate.id || sha256(mandate.signature) !== body.mandate.signatureHash) {
      return { ok: false, reason: 'mandate_mismatch' };
    }
  }
  return { ok: true };
}

// The value a receipt contributes to the log.
export const receiptLeaf = (receipt) => sha256(stable(receipt));
