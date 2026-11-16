// A mandate is the human's signed instruction to their agent: who may spend, where,
// how much per purchase, how much in total, until when. It is the only artefact in
// an agentic payment that records what the human actually agreed to, which makes it
// both the authorisation check before the payment and the evidence after a dispute.
//
// Signatures are real Ed25519 (node:crypto). The simulator runs this code path, it
// does not model it.

import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';

/**
 * @typedef {Object} Mandate
 * @property {string} id
 * @property {string} principal        Who delegated (the cardholder).
 * @property {string} agentId          Who may act.
 * @property {string} [purpose]        What the human asked for, in their words.
 * @property {string[]} categories     Merchant categories in scope.
 * @property {number} maxPerTxn
 * @property {number} maxTotal
 * @property {number} expiresAt        Simulation clock tick.
 * @property {string} publicKeyPem     Principal's key, as registered.
 * @property {string} signature        base64 Ed25519 over canonical(mandate).
 */

export function createPrincipal(name) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    name,
    privateKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

// Canonical form: fixed field order, no signature. Two parties must hash the same
// bytes or the signature is meaningless.
export function canonical(m) {
  return JSON.stringify([
    m.id,
    m.principal,
    m.agentId,
    m.purpose ?? '',
    [...m.categories].sort(),
    m.maxPerTxn,
    m.maxTotal,
    m.expiresAt,
  ]);
}

export function issueMandate(principal, fields) {
  const m = { ...fields, principal: principal.name, publicKeyPem: principal.publicKeyPem };
  m.signature = sign(null, Buffer.from(canonical(m)), principal.privateKey).toString('base64');
  return m;
}

// Signature verification is a pure function of (key, bytes, signature), so it is
// safe to memoise process-wide. A production gateway does the same per mandate.
const verified = new Map();
export function signatureValid(m) {
  const key = createHash('sha256')
    .update(m.publicKeyPem)
    .update(canonical(m))
    .update(m.signature)
    .digest('base64');
  let ok = verified.get(key);
  if (ok === undefined) {
    try {
      ok = verify(null, Buffer.from(canonical(m)), m.publicKeyPem, Buffer.from(m.signature, 'base64'));
    } catch {
      ok = false;
    }
    verified.set(key, ok);
  }
  return ok;
}

// Identity check: is this mandate signed by the key registered for the principal?
// A forged mandate carries a valid signature from the wrong key.
export function attest(m, registry) {
  const registered = registry.get(m.principal);
  if (!registered) return { ok: false, reason: 'unknown_principal' };
  if (registered !== m.publicKeyPem) return { ok: false, reason: 'key_mismatch' };
  if (!signatureValid(m)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}

// Scope check: does this purchase fall inside what was delegated? `spent` is the
// running total the gateway has already authorised against this mandate.
export function checkScope(m, purchase, spent, now) {
  if (now > m.expiresAt) return { ok: false, reason: 'mandate_expired' };
  if (!m.categories.includes(purchase.category)) return { ok: false, reason: 'out_of_scope' };
  if (purchase.amount > m.maxPerTxn) return { ok: false, reason: 'over_per_txn_cap' };
  if (spent + purchase.amount > m.maxTotal) return { ok: false, reason: 'over_budget' };
  return { ok: true };
}
