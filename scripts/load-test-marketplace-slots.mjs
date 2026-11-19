#!/usr/bin/env node
/**
 * QA-07 — Node load harness approximating 50 rps with p95 latency reporting.
 * Prefer `k6 run perf/k6/marketplace-slots-bookings.js` when k6 is installed.
 *
 * Default target: /api/v1/health/ready (always available locally).
 * Marketplace slots: set LOAD_TEST_PATH + auth headers via env.
 *
 * SLO: p95 < 150 ms at ~50 rps (LOAD_TEST_RPS, default 50; LOAD_TEST_DURATION_S default 5 in CI).
 */
import { Agent, request } from "node:http";
import { pathToFileURL } from "node:url";

const BASE = (process.env.LOAD_TEST_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const PATH = process.env.LOAD_TEST_PATH ?? "/api/v1/health/ready";
const RPS = Number(process.env.LOAD_TEST_RPS ?? 50);
const DURATION_S = Number(process.env.LOAD_TEST_DURATION_S ?? 5);
const P95_MAX_MS = Number(process.env.LOAD_TEST_P95_MAX_MS ?? 150);
const TIMEOUT_MS = Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 5000);
const DRY = process.env.LOAD_TEST_DRY_RUN === "1";

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

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function main() {
  if (DRY) {
    console.log(JSON.stringify({ dryRun: true, rps: RPS, p95MaxMs: P95_MAX_MS, path: PATH }, null, 2));
    console.log("PASS: dry-run (no HTTP)");
    return;
  }

  const total = Math.max(1, Math.round(RPS * DURATION_S));
  const agent = new Agent({ keepAlive: true, maxSockets: Math.max(RPS, 20) });
  const latencies = [];
  let ok = 0;
  let sent = 0;
  const wallStart = Date.now();
  const intervalMs = 1000 / RPS;

  async function worker() {
    while (true) {
      const n = sent++;
      if (n >= total) return;
      const target = wallStart + n * intervalMs;
      const wait = target - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const result = await oneRequest(agent);
      if (result.ok) ok++;
      latencies.push(result.ms);
    }
  }

  const workers = Array.from({ length: Math.min(RPS, 40) }, () => worker());
  await Promise.all(workers);
  agent.destroy();

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const elapsed = Date.now() - wallStart;
  const achievedRps = total / (elapsed / 1000);

  const report = {
    base: BASE,
    path: PATH,
    total,
    ok,
    targetRps: RPS,
    achievedRps: Number(achievedRps.toFixed(1)),
    wallMs: elapsed,
    latencyMs: { p50, p95, p95Max: P95_MAX_MS },
  };
  console.log(JSON.stringify(report, null, 2));

  if (ok / total < 0.99) {
    console.error(`FAIL: success rate ${((ok / total) * 100).toFixed(2)}% < 99%`);
    process.exit(1);
  }
  if (p95 > P95_MAX_MS) {
    console.error(`FAIL: slots/path p95 ${p95}ms > ${P95_MAX_MS}ms at ~${RPS} rps`);
    process.exit(1);
  }
  console.log("PASS: QA-07 load SLO met (p95 < threshold at target rps)");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
