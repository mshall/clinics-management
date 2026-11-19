#!/usr/bin/env node
/**
 * QA-07 — validate Lighthouse mobile-4G budget artefacts.
 * When `lighthouse` CLI is available and LH_URL is set, run a real audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET = join(ROOT, "perf/lighthouse/budget.json");
const CONFIG = join(ROOT, "perf/lighthouse/mobile-4g.json");

function validateBudgetFile() {
  if (!existsSync(BUDGET) || !existsSync(CONFIG)) {
    throw new Error("missing perf/lighthouse budget or mobile-4g config");
  }
  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  const interactive = budget[0]?.timings?.find((t) => t.metric === "interactive");
  if (!interactive || interactive.budget > 4000) {
    throw new Error("interactive budget must be ≤ 4000 ms (TTI on mid-range Android 4G)");
  }
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
  if (cfg.settings?.formFactor !== "mobile") {
    throw new Error("lighthouse config must use mobile formFactor");
  }
  console.log(
    JSON.stringify(
      {
        budgetOk: true,
        interactiveBudgetMs: interactive.budget,
        formFactor: cfg.settings.formFactor,
        width: cfg.settings.screenEmulation?.width,
      },
      null,
      2,
    ),
  );
}

function maybeRunLighthouse() {
  const url = process.env.LH_URL;
  if (!url) {
    console.log("SKIP live lighthouse (set LH_URL to run)");
    return;
  }
  const which = spawnSync("which", ["lighthouse"], { encoding: "utf8" });
  if (which.status !== 0) {
    console.log("SKIP live lighthouse (CLI not installed)");
    return;
  }
  const out = spawnSync(
    "lighthouse",
    [url, "--budget-path", BUDGET, "--config-path", CONFIG, "--chrome-flags=--headless", "--quiet", "--output=json", "--output-path=stdout"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (out.status !== 0) {
    console.error(out.stderr || out.stdout);
    throw new Error("lighthouse budget failed");
  }
  console.log("PASS: lighthouse budget");
}

function main() {
  validateBudgetFile();
  maybeRunLighthouse();
  console.log("PASS: QA-07 lighthouse budget artefacts");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
