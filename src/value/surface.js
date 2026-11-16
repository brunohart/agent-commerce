// Response surface: what the simulator says a portfolio of bets earns per purchase
// intent, across a grid of agent share and ticket fragmentation. The Monte Carlo in
// model.js interpolates this surface thousands of times instead of re-running the
// simulator for every draw.

import { simulateMean } from '../sim/simulate.js';
import { BET_KEYS, SEGMENTS } from '../assumptions.js';
import { clamp } from '../rng.js';

export const SHARE_GRID = [0, 0.15, 0.4, 0.8];
export const TICKET_GRID = [1, 0.6, 0.3];

export function allPortfolios() {
  const out = [];
  for (let mask = 0; mask < 1 << BET_KEYS.length; mask++) {
    out.push(BET_KEYS.filter((_, i) => mask & (1 << i)));
  }
  return out;
}
export const portfolioKey = (bets) => (bets.length ? BET_KEYS.filter((b) => bets.includes(b)).join('+') : 'none');

/**
 * @returns {Record<string, Record<string, {net:number[][], mlr:number[][], cliff:number[][]}>>}
 *          surface[segment][portfolioKey].net[shareIndex][ticketIndex]
 */
export function buildSurface({ intents = 6000, seeds = 3, seed = 7, onProgress } = {}) {
  const portfolios = allPortfolios();
  const surface = {};
  const total = Object.keys(SEGMENTS).length * portfolios.length;
  let done = 0;
  for (const segment of Object.keys(SEGMENTS)) {
    surface[segment] = {};
    for (const bets of portfolios) {
      // With no agents the ticket factor cannot matter, but the controls still can:
      // storm-proofing protects human retries too.
      const base = simulateMean({ segment, agentShare: 0, bets, intents, seed }, seeds);
      const cell = { net: [], mlr: [], cliff: [] };
      SHARE_GRID.forEach((share, si) => {
        cell.net.push([]);
        cell.mlr.push([]);
        cell.cliff.push([]);
        for (const ticketFactor of TICKET_GRID) {
          const r = share === 0 ? base : simulateMean({ segment, agentShare: share, ticketFactor, bets, intents, seed }, seeds);
          cell.net[si].push(r.perIntent.gatewayNet);
          cell.mlr[si].push(r.merchantLossRate);
          cell.cliff[si].push(r.cliffShare);
        }
      });
      surface[segment][portfolioKey(bets)] = cell;
      onProgress?.(++done, total);
    }
  }
  return surface;
}

/**
 * A surface for hand-picked variants of one portfolio (for example the same bets
 * with different decision backends). `variants` maps a name to simulate() options.
 */
export function buildVariantSurface(bets, variants, { intents = 6000, seeds = 3, seed = 7 } = {}) {
  const surface = {};
  for (const segment of Object.keys(SEGMENTS)) {
    surface[segment] = {};
    for (const [name, run] of Object.entries(variants)) {
      const cell = { net: [], mlr: [], cliff: [] };
      SHARE_GRID.forEach((share, si) => {
        const row = { net: [], mlr: [], cliff: [] };
        const base = share === 0 ? simulateMean({ segment, agentShare: 0, bets, intents, seed, ...run }, seeds) : null;
        for (const ticketFactor of TICKET_GRID) {
          const r = base ?? simulateMean({ segment, agentShare: share, ticketFactor, bets, intents, seed, ...run }, seeds);
          row.net.push(r.perIntent.gatewayNet);
          row.mlr.push(r.merchantLossRate);
          row.cliff.push(r.cliffShare);
        }
        cell.net[si] = row.net;
        cell.mlr[si] = row.mlr;
        cell.cliff[si] = row.cliff;
      });
      surface[segment][name] = cell;
    }
  }
  return surface;
}

function bracket(grid, x) {
  // grid may ascend (share) or descend (ticket)
  const asc = grid[0] < grid[grid.length - 1];
  const v = clamp(x, Math.min(grid[0], grid[grid.length - 1]), Math.max(grid[0], grid[grid.length - 1]));
  for (let i = 0; i < grid.length - 1; i++) {
    const a = grid[i];
    const b = grid[i + 1];
    if (asc ? v >= a && v <= b : v <= a && v >= b) return [i, (v - a) / (b - a)];
  }
  return [grid.length - 2, 1];
}

// Bilinear interpolation over (agent share, ticket factor).
export function interpolate(table, share, ticketFactor) {
  const [i, u] = bracket(SHARE_GRID, share);
  const [j, v] = bracket(TICKET_GRID, ticketFactor);
  const a = table[i][j] + (table[i][j + 1] - table[i][j]) * v;
  const b = table[i + 1][j] + (table[i + 1][j + 1] - table[i + 1][j]) * v;
  return a + (b - a) * u;
}
