#!/usr/bin/env node
/**
 * Lightweight concurrency smoke for AWS-scale SLO guardrails.
 * Default: 2000 requests / 50 workers → require ≥99.9% HTTP 200 on /api/v1/health/live.
 */
import { Agent, request } from "node:http";
import { pathToFileURL } from "node:url";

const BASE = (process.env.LOAD_TEST_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const PATH = process.env.LOAD_TEST_PATH ?? "/api/v1/health/live";
const TOTAL = Number(process.env.LOAD_TEST_TOTAL ?? 2000);
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY ?? 50);
const MIN_SUCCESS_RATE = Number(process.env.LOAD_TEST_MIN_SUCCESS_RATE ?? 0.999);
const TIMEOUT_MS = Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 5000);

function oneRequest(agent) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = request(
      `${BASE}${PATH}`,
      { method: "GET", agent, timeout: TIMEOUT_MS },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ ok: res.statusCode === 200, ms: Date.now() - started }));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, ms: TIMEOUT_MS });
    });
    req.on("error", () => resolve({ ok: false, ms: Date.now() - started }));
    req.end();
  });
}

async function main() {
  const agent = new Agent({ keepAlive: true, maxSockets: CONCURRENCY });
  let sent = 0;
  let ok = 0;
  const latencies = [];

  async function worker() {
    while (true) {
      const n = sent++;
      if (n >= TOTAL) return;
      const result = await oneRequest(agent);
      if (result.ok) ok++;
      latencies.push(result.ms);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  const wallStart = Date.now();
  await Promise.all(workers);
  agent.destroy();

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  const rate = ok / TOTAL;
  const elapsed = Date.now() - wallStart;

  console.log(
    JSON.stringify(
      {
        base: BASE,
        path: PATH,
        total: TOTAL,
        concurrency: CONCURRENCY,
        success: ok,
        successRate: rate,
        minSuccessRate: MIN_SUCCESS_RATE,
        wallMs: elapsed,
        latencyMs: { p50, p99 },
      },
      null,
      2,
    ),
  );

  if (rate < MIN_SUCCESS_RATE) {
    console.error(`FAIL: success rate ${(rate * 100).toFixed(3)}% < ${(MIN_SUCCESS_RATE * 100).toFixed(1)}% SLO`);
    process.exit(1);
  }
  console.log("PASS: load SLO met");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
