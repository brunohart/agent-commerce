// Append-only Merkle log of receipts.
//
// The gateway publishes one 64-character root per period (to a scheme, a regulator,
// a public page). After that it cannot add, remove or alter a receipt from that
// period without the root changing. An inclusion proof for one receipt is a handful
// of hashes: log2(n) of them, about 20 for a million receipts.

import { sha256 } from './receipt.js';

const pair = (left, right) => sha256(`node:${left}:${right}`);
const leafHash = (leaf) => sha256(`leaf:${leaf}`);

export class ReceiptLog {
  constructor() {
    this.leaves = [];
  }

  append(leaf) {
    this.leaves.push(leafHash(leaf));
    return this.leaves.length - 1;
  }

  get size() {
    return this.leaves.length;
  }

  // Levels of the tree, bottom up. An odd node is carried up unchanged.
  #levels() {
    const levels = [this.leaves];
    while (levels.at(-1).length > 1) {
      const prev = levels.at(-1);
      const next = [];
      for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? pair(prev[i], prev[i + 1]) : prev[i]);
      levels.push(next);
    }
    return levels;
  }

  root() {
    if (!this.leaves.length) return sha256('empty');
    return this.#levels().at(-1)[0];
  }

  /** @returns {{hash: string, side: 'left'|'right'}[]} sibling hashes from leaf to root */
  proof(index) {
    if (index < 0 || index >= this.leaves.length) throw new Error('no such receipt in the log');
    const path = [];
    let i = index;
    for (const level of this.#levels().slice(0, -1)) {
      const sibling = i % 2 ? i - 1 : i + 1;
      if (sibling < level.length) path.push({ hash: level[sibling], side: i % 2 ? 'left' : 'right' });
      i = Math.floor(i / 2);
    }
    return path;
  }
}

// Anyone can run this with nothing but the receipt's leaf, the proof and the
// published root. It does not need the log.
export function verifyInclusion(leaf, proof, root) {
  let hash = leafHash(leaf);
  for (const step of proof) hash = step.side === 'left' ? pair(step.hash, hash) : pair(hash, step.hash);
  return hash === root;
}
