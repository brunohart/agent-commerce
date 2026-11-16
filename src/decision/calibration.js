// Calibration: does "90% sure" mean right nine times in ten, on this traffic?
//
// A decision model's probability goes straight into an expected-value calculation,
// so miscalibration is not a quality issue, it is a pricing error. A model can rank
// payments perfectly and still cost money if its 2% means 10%.

const EPS = 1e-6;
const clip = (p) => Math.min(1 - EPS, Math.max(EPS, p));
export const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Mean squared error of the probability. Lower is better; 0 is perfect. */
export function brier(pairs) {
  if (!pairs.length) return NaN;
  return pairs.reduce((s, [p, y]) => s + (p - y) ** 2, 0) / pairs.length;
}

/**
 * Expected calibration error over equal-count bins: the average gap between what
 * the model said and what happened, weighted by how often it said it.
 */
export function ece(pairs, bins = 10) {
  if (!pairs.length) return NaN;
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const size = Math.ceil(sorted.length / bins);
  let total = 0;
  for (let i = 0; i < sorted.length; i += size) {
    const bin = sorted.slice(i, i + size);
    const said = bin.reduce((s, [p]) => s + p, 0) / bin.length;
    const happened = bin.reduce((s, [, y]) => s + y, 0) / bin.length;
    total += (bin.length / sorted.length) * Math.abs(said - happened);
  }
  return total;
}

/**
 * Platt scaling: fit p' = sigmoid(a * logit(p) + b) to observed outcomes.
 * Two parameters, Newton's method. a < 1 means the model was overconfident.
 */
export function fitPlatt(pairs, iterations = 25) {
  let a = 1;
  let b = 0;
  if (pairs.length < 50 || !pairs.some(([, y]) => y === 1) || !pairs.some(([, y]) => y === 0)) return { a, b };
  const xs = pairs.map(([p]) => logit(p));
  for (let it = 0; it < iterations; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < xs.length; i++) {
      const q = sigmoid(a * xs[i] + b);
      const d = q - pairs[i][1];
      const w = Math.max(q * (1 - q), 1e-9);
      ga += d * xs[i];
      gb += d;
      haa += w * xs[i] * xs[i];
      hab += w * xs[i];
      hbb += w;
    }
    haa += 1e-6; // ridge: keeps the step finite when the data are nearly separable
    hbb += 1e-6;
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { a: 1, b: 0 };
  return { a, b };
}

export const applyPlatt = ({ a, b }, p) => sigmoid(a * logit(p) + b);
