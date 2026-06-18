#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const entryPath = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api", "docker-entrypoint.mjs");
const entry = readFileSync(entryPath, "utf8");

let failed = false;

if (!/proxy\.listen\(publicPort, "0\.0\.0\.0"/.test(entry)) {
  console.error(`${entryPath}: must call proxy.listen on 0.0.0.0:PORT synchronously`);
  failed = true;
}

if (!/bootWorker\(internalPort\)/.test(entry)) {
  console.error(`${entryPath}: must start bootWorker after listen callback`);
  failed = true;
}

if (/process\.exit\s*\(\s*1\s*\)/.test(entry)) {
  console.error(`${entryPath}: must not process.exit(1) during boot`);
  failed = true;
}

if (!/runChild\("npx", \["prisma", "migrate", "deploy"\]\)/.test(entry)) {
  console.error(`${entryPath}: runMigrate must use npx prisma migrate deploy`);
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
