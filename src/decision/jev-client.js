// HTTP client for Jev. Not used by the simulator or the tests, which run offline
// against src/decision/simulated.js. This is the piece you would swap in for a
// shadow-mode pilot: same interface, real model.
//
// The endpoint, auth, request and response shapes match TypeSafe's API reference
// (see request.js). It has NOT been run against the live API, because that needs a
// key. `node src/cli.js measure` is the first thing to run once one is available.
// The key is read from the environment and never logged.

import { parseAnswers } from './request.js';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export class JevClient {
  constructor({ apiKey = process.env.TYPESAFE_API_KEY, endpoint = ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set');
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
  }

  /**
   * @param {{wire: object}} request   From buildDecisionRequest().
   * @param {number} deadlineMs        Hard deadline. A payment cannot wait.
   * @returns {Promise<Outcome>}       Never throws: every failure is an outcome
   *                                   the guard can act on.
   */
  async decide(request, deadlineMs) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const res = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(request.wire),
        signal: controller.signal,
      });
      const latencyMs = performance.now() - started;
      if (!res.ok) {
        // 429 rate limited and 529 overloaded are retryable in general, but not
        // inside a payment's latency budget. Treat every non-2xx as "no answer".
        return { ok: false, error: `http_${res.status}`, latencyMs };
      }
      const body = await res.json();
      const p = parseAnswers(body);
      if (!p) return { ok: false, error: 'malformed_answer', latencyMs };
      return { ok: true, p, version: body.model ?? null, latencyMs };
    } catch (err) {
      const latencyMs = performance.now() - started;
      return { ok: false, error: err?.name === 'AbortError' ? 'deadline' : 'network', latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
