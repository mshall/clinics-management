#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = join(root, "apps", "api", "docker-entrypoint.mjs");
const bootPath = join(root, "apps", "api", "docker-boot.mjs");
const entry = readFileSync(entryPath, "utf8");
const boot = readFileSync(bootPath, "utf8");

let failed = false;

const listenIdx = entry.indexOf("server.listen(publicPort");
const spawnBootIdx = entry.indexOf("spawn(process.execPath, [bootScript]");
if (listenIdx < 0) {
  console.error(`${entryPath}: must call server.listen on PORT synchronously`);
  failed = true;
} else if (spawnBootIdx >= 0 && spawnBootIdx < listenIdx) {
  console.error(`${entryPath}: must bind PORT before spawning docker-boot.mjs`);
  failed = true;
}

if (/async function main\s*\(/m.test(entry)) {
  console.error(`${entryPath}: must not defer listen behind async main()`);
  failed = true;
}

for (const [label, src] of [
  ["entrypoint", entry],
  ["docker-boot", boot],
]) {
  if (/process\.exit\s*\(\s*1\s*\)/.test(src)) {
    console.error(`${label}: must not process.exit(1) during boot`);
    failed = true;
  }
}

if (!/runChild\("prisma", \["migrate", "deploy"\]\)/.test(boot)) {
  console.error(`${bootPath}: runMigrate must use global prisma migrate deploy`);
  failed = true;
}

if (/^import\s+.*@aws-sdk\/client-secrets-manager/m.test(boot)) {
  console.error(`${bootPath}: use dynamic import for @aws-sdk/client-secrets-manager`);
  failed = true;
}

if (!/method !== "GET" && method !== "HEAD"/.test(entry)) {
  console.error(`${entryPath}: must accept HEAD for App Runner liveness`);
  failed = true;
}

if (!/\/api\/v1\/health\/live\/"/.test(entry)) {
  console.error(`${entryPath}: must normalize /api/v1/health/live deploy probe`);
  failed = true;
}

if (!/\/health\/live\/"/.test(entry) || !/probePath === "\/health\/live"/.test(entry)) {
  console.error(`${entryPath}: must treat /health/live as App Runner deploy probe`);
  failed = true;
}

if (!/probePath === "\/"/.test(entry) || !/probePath === "\/health"/.test(entry)) {
  console.error(`${entryPath}: must treat "/" and "/health" as App Runner deploy probes`);
  failed = true;
}

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
