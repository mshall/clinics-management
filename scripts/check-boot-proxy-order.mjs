#!/usr/bin/env node
/**
 * CI guard: App Runner liveness requires :3000 to listen before secret/migrate work.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api");
const listenerPath = join(apiDir, "health-listener.mjs");
const bootPath = join(apiDir, "docker-boot.mjs");
const listener = readFileSync(listenerPath, "utf8");
const boot = readFileSync(bootPath, "utf8");

let failed = false;

const listenIdx = listener.indexOf("server.listen(publicPort");
const awaitListenIdx = listener.indexOf("await listenOnPort()");
const spawnBootIdx = listener.indexOf("spawn(process.execPath, [bootScript]");
if (listenIdx < 0) {
  console.error(`${listenerPath}: must call server.listen on PORT`);
  failed = true;
} else if (awaitListenIdx < 0) {
  console.error(`${listenerPath}: must await listenOnPort() before spawning docker-boot.mjs`);
  failed = true;
} else if (spawnBootIdx >= 0 && spawnBootIdx < awaitListenIdx) {
  console.error(`${listenerPath}: must await PORT bind before spawning docker-boot.mjs`);
  failed = true;
}

if (!/method !== "GET" && method !== "HEAD"/.test(listener)) {
  console.error(`${listenerPath}: must accept HEAD for App Runner liveness`);
  failed = true;
}

if (!/\/api\/v1\/health\/live\/"/.test(listener)) {
  console.error(`${listenerPath}: must accept trailing slash on /api/v1/health/live/`);
  failed = true;
}

if (!/\/health\/live\/"/.test(listener) || !/probePath === "\/health\/live"/.test(listener)) {
  console.error(`${listenerPath}: must treat /health/live as App Runner deploy probe (returns 503 if proxied)`);
  failed = true;
}

if (!/probePath === "\/"/.test(listener) || !/probePath === "\/health"/.test(listener)) {
  console.error(`${listenerPath}: must treat "/" and "/health" as App Runner deploy probes`);
  failed = true;
}

if (/^import\s+.*@aws-sdk\/client-secrets-manager/m.test(boot)) {
  console.error(`${bootPath}: use dynamic import for @aws-sdk/client-secrets-manager`);
  failed = true;
}

if (/process\.exit\s*\(\s*1\s*\)/.test(boot)) {
  console.error(`${bootPath}: must not process.exit(1) during boot`);
  failed = true;
}

if (!/runChild\("prisma", \["migrate", "deploy"\]\)/.test(boot)) {
  console.error(`${bootPath}: runMigrate must use prisma migrate deploy (global CLI from Dockerfile)`);
  failed = true;
}

if (/child\.on\("error", reject\)/.test(boot)) {
  console.error(`${bootPath}: runChild must resolve on spawn error, not reject`);
  failed = true;
}

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
