#!/usr/bin/env node
/**
 * App Runner health-checks PORT (3000) during deploy. health-sidecar.mjs must bind :3000
 * before docker-boot.mjs runs (via docker-entrypoint.sh).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api");
const sidecarPath = join(apiDir, "health-sidecar.mjs");
const shellPath = join(apiDir, "docker-entrypoint.sh");
const bootPath = join(apiDir, "docker-boot.mjs");

const sidecar = readFileSync(sidecarPath, "utf8");
const shell = readFileSync(shellPath, "utf8");
const boot = readFileSync(bootPath, "utf8");

let failed = false;

if (!/health-sidecar\.mjs/.test(shell)) {
  console.error(`${shellPath}: must start health-sidecar.mjs before docker-boot.mjs`);
  failed = true;
}

if (!/method === "GET" \|\| method === "HEAD"/.test(sidecar)) {
  console.error(`${sidecarPath}: must accept HEAD for App Runner liveness`);
  failed = true;
}

if (!/\/api\/v1\/health\/live\/"/.test(sidecar)) {
  console.error(`${sidecarPath}: must accept trailing slash on /api/v1/health/live/`);
  failed = true;
}

if (/^import\s+.*@aws-sdk\/client-secrets-manager/m.test(boot)) {
  console.error(`${bootPath}: use dynamic import for @aws-sdk/client-secrets-manager`);
  failed = true;
}

if (/process\.exit\s*\(\s*1\s*\)/.test(boot)) {
  console.error(`${bootPath}: must not process.exit(1) — health sidecar must stay up during boot`);
  failed = true;
}

const migrateFn = boot.match(/async function runMigrate[\s\S]*?^}/m);
if (migrateFn && /process\.exit\s*\(/.test(migrateFn[0])) {
  console.error(`${bootPath}: runMigrate must not process.exit`);
  failed = true;
}

const secretFn = boot.match(/async function loadDbSecretFromArn[\s\S]*?^}/m);
if (secretFn && /process\.exit\s*\(\s*1\s*\)/.test(secretFn[0])) {
  console.error(`${bootPath}: loadDbSecretFromArn must not process.exit`);
  failed = true;
}

if (!/runChild\("npx", \["prisma", "migrate", "deploy"\]\)/.test(boot)) {
  console.error(`${bootPath}: runMigrate must use npx prisma migrate deploy`);
  failed = true;
}

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
