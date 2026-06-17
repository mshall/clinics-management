#!/usr/bin/env node
/**
 * CI guard: App Runner liveness requires :3000 to listen before secret/migrate work.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api");
const entryPath = join(apiDir, "docker-entrypoint.mjs");
const entry = readFileSync(entryPath, "utf8");

let failed = false;

const listenIdx = entry.indexOf("proxy.listen(publicPort");
const listenReadyIdx = entry.indexOf("await listenReady");
const secretCallIdx = entry.indexOf("await loadDbSecretFromArn");
const migrateCallIdx = entry.indexOf("await runMigrate");

if (listenIdx < 0) {
  console.error(`${entryPath}: must call proxy.listen(publicPort) before async boot work`);
  failed = true;
} else {
  if (secretCallIdx >= 0 && listenIdx > secretCallIdx) {
    console.error(`${entryPath}: must listen on PORT before loadDbSecretFromArn`);
    failed = true;
  }
  if (migrateCallIdx >= 0 && listenIdx > migrateCallIdx) {
    console.error(`${entryPath}: must listen on PORT before runMigrate`);
    failed = true;
  }
}

if (listenReadyIdx < 0) {
  console.error(`${entryPath}: main() must await listenReady before secret/migrate`);
  failed = true;
} else if (secretCallIdx >= 0 && listenReadyIdx > secretCallIdx) {
  console.error(`${entryPath}: must await listenReady before loadDbSecretFromArn`);
  failed = true;
}

if (/^import\s+.*@aws-sdk\/client-secrets-manager/m.test(entry)) {
  console.error(`${entryPath}: use dynamic import for @aws-sdk/client-secrets-manager`);
  failed = true;
}

if (/process\.exit\s*\(\s*1\s*\)/.test(entry)) {
  console.error(`${entryPath}: must not process.exit(1) during boot`);
  failed = true;
}

if (
  !/method === "GET" \|\| method === "HEAD"/.test(entry) &&
  !/method !== "GET" && method !== "HEAD"/.test(entry)
) {
  console.error(`${entryPath}: must accept HEAD for App Runner liveness`);
  failed = true;
}

if (!/\/api\/v1\/health\/live\/"/.test(entry)) {
  console.error(`${entryPath}: must accept trailing slash on /api/v1/health/live/`);
  failed = true;
}

if (!/probePath === "\/"/.test(entry)) {
  console.error(`${entryPath}: must accept "/" for App Runner env-update health probes`);
  failed = true;
}

if (!/runChild\("npx", \["prisma", "migrate", "deploy"\]\)/.test(entry)) {
  console.error(`${entryPath}: runMigrate must use npx prisma migrate deploy`);
  failed = true;
}

if (/child\.on\("error", reject\)/.test(entry)) {
  console.error(`${entryPath}: runChild must resolve on spawn error, not reject`);
  failed = true;
}

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
