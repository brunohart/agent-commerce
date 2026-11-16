// HTTP client for Jev. Not used by the simulator or the tests, which run offline
// against src/decision/simulated.js. This is the piece you would swap in for a
// shadow-mode pilot: same interface, real model.
//
// Endpoint, auth, request and answer shapes are checked against TypeSafe's API
// reference (docs.typesafe.ai/api, 16 Nov 2026). To prove it against the live model,
// run `npm run jev:smoke` with TYPESAFE_API_KEY set (scripts/jev-smoke.js). The key
// is read from the environment and never logged.
//
// TYPESAFE_BASE_URL points it at a compatible gateway or test server instead; the
// default is TypeSafe's own API.

import { parseAnswers } from './request.js';

const BASE_URL = process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai';

export class JevClient {
  constructor({
    apiKey = process.env.TYPESAFE_API_KEY,
    baseUrl = BASE_URL,
    endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/systemone`,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
  }

  /** Model names this key can use (GET /v1/models). For setup, not the payment path. */
  async listModels() {
    const res = await this.fetch(`${this.baseUrl}/v1/models`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`GET /v1/models failed: http_${res.status}`);
    const body = await res.json();
    const list = Array.isArray(body) ? body : body?.data ?? body?.models ?? [];
    return list.map((m) => (typeof m === 'string' ? m : m?.id ?? m?.name)).filter(Boolean);
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
