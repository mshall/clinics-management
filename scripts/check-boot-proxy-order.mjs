#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const entryPath = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api", "docker-entrypoint.mjs");
const entry = readFileSync(entryPath, "utf8");

let failed = false;

const mainFn = entry.match(/async function main\(\)[\s\S]*?^}/m)?.[0] ?? "";
const listenIdx = mainFn.indexOf("await listenForever(proxy, publicPort)");
const workerIdx = mainFn.indexOf("bootWorker(");
if (listenIdx < 0) {
  console.error(`${entryPath}: main() must await listenForever on PORT first`);
  failed = true;
} else if (workerIdx >= 0 && workerIdx < listenIdx) {
  console.error(`${entryPath}: must bind PORT before bootWorker`);
  failed = true;
}

if (/process\.exit\s*\(\s*1\s*\)/.test(entry)) {
  console.error(`${entryPath}: must not process.exit(1) during boot`);
  failed = true;
}

if (!/runChild\("prisma", \["migrate", "deploy"\]\)/.test(entry)) {
  console.error(`${entryPath}: runMigrate must use global prisma migrate deploy`);
  failed = true;
}

if (!/listenForever\(/.test(entry) || !/listen failed, retrying/.test(entry)) {
  console.error(`${entryPath}: must retry PORT bind (listenForever) instead of exiting on EADDRINUSE`);
  failed = true;
}

if (!/probePath === "\/health\/live"/.test(entry)) {
  console.error(`${entryPath}: must treat /health/live as deploy probe (200 during boot)`);
  failed = true;
}

if (/^import\s+.*@aws-sdk\/client-secrets-manager/m.test(entry)) {
  console.error(`${entryPath}: use dynamic import for @aws-sdk/client-secrets-manager`);
  failed = true;
}

if (!/probePath === "\/"/.test(entry)) {
  console.error(`${entryPath}: must treat "/" as App Runner deploy probe`);
  failed = true;
}

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
