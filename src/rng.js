// Seeded PRNG (mulberry32) plus the handful of distributions the model needs.
// Everything in this repo is deterministic given a seed: a result that cannot be
// reproduced cannot be argued with, and a decision model has to be arguable.

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(String(seed))) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return {
    next,
    normal,
    bool: (p) => next() < p,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    lognormal: (median, sigma) => median * Math.exp(sigma * normal()),
    triangular: (lo, mode, hi) => triangularQuantile(next(), lo, mode, hi),
    fork: (label) => createRng(hashSeed(String(a), label)),
  };
}

// Inverse CDF of a triangular distribution. Used both for sampling and for the
// one-at-a-time sensitivity sweep (p10 / p50 / p90 of each prior).
export function triangularQuantile(u, lo, mode, hi) {
  if (hi === lo) return lo;
  const f = (mode - lo) / (hi - lo);
  return u < f
    ? lo + Math.sqrt(u * (hi - lo) * (mode - lo))
    : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
}

export function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
