#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const entryPath = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api", "docker-entrypoint.mjs");
const entry = readFileSync(entryPath, "utf8");

let failed = false;

if (!/createBootHealthServer|createServer\(\(req, res\)/.test(entry)) {
  console.error(`${entryPath}: must expose a health HTTP listener during boot/migrate`);
  failed = true;
}

if (!/await listenFrontProxy\(frontProxy\)/.test(entry)) {
  console.error(`${entryPath}: must bind front proxy on PORT before secret fetch / migrate`);
  failed = true;
}

if (/closeHealthServer|boot health listener closed/.test(entry)) {
  console.error(`${entryPath}: must not close the public listener before Nest is ready (use proxy handoff)`);
  failed = true;
}

if (!/NEST_INTERNAL_PORT|nestPort/.test(entry)) {
  console.error(`${entryPath}: must run Nest on an internal port and proxy from App Runner PORT`);
  failed = true;
}

if (!/spawn\(process\.execPath, \[mainJs\]/.test(entry)) {
  console.error(`${entryPath}: must spawn Nest from dist/main.js`);
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

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
