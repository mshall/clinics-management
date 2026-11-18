#!/usr/bin/env node
/**
 * QA-02 gate: ≥85% line coverage in billing, billing-platform, and credits.
 */
import { spawnSync } from "node:child_process";

const patterns = [
  "src/billing/**/*.test.ts",
  "src/billing-platform/**/*.test.ts",
  "src/credits/**/*.test.ts",
];

const args = [
  "--import",
  "tsx",
  "--experimental-test-coverage",
  "--test-coverage-lines=85",
  "--test-coverage-include=src/billing/**",
  "--test-coverage-include=src/billing-platform/**",
  "--test-coverage-include=src/credits/**",
  "--test",
  ...patterns,
];

const res = spawnSync(process.execPath, args, { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname });
process.exit(res.status ?? 1);