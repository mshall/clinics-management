#!/usr/bin/env node
/**
 * App Runner health-checks PORT (3000) during deploy. docker-entrypoint.mjs must bind :3000
 * via listenServer(proxy) before any VPC/Secrets Manager / migrate work.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const entrypointPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "api",
  "docker-entrypoint.mjs",
);
const source = readFileSync(entrypointPath, "utf8");

if (/^import\s+.*@aws-sdk\//m.test(source)) {
  console.error(
    `${entrypointPath}: do not statically import @aws-sdk at module load — dynamic-import after listenServer so :3000 binds before heavy SDK init`,
  );
  process.exit(1);
}

const mainMatch = source.match(/async function main\s*\(\)\s*\{([\s\S]*?)^\}/m);
if (!mainMatch) {
  console.error(`${entrypointPath}: missing async function main()`);
  process.exit(1);
}

const mainBody = mainMatch[1];
const listenIdx = mainBody.search(/await listenServer\s*\(\s*proxy/);
const secretIdx = mainBody.search(/await loadDbSecretFromArn\s*\(/);
const migrateIdx = mainBody.search(/await runMigrateWithRetry\s*\(/);
const vpceEnvIdx = mainBody.search(/AWS_ENDPOINT_URL_SECRETS_MANAGER/);

let failed = false;

if (listenIdx === -1) {
  console.error(`${entrypointPath}: main() must await listenServer(proxy, …) before boot work`);
  failed = true;
}
if (secretIdx !== -1 && listenIdx !== -1 && secretIdx < listenIdx) {
  console.error(
    `${entrypointPath}: loadDbSecretFromArn must run after listenServer(proxy) — proxy must answer liveness during secret retries`,
  );
  failed = true;
}
if (migrateIdx !== -1 && listenIdx !== -1 && migrateIdx < listenIdx) {
  console.error(
    `${entrypointPath}: runMigrateWithRetry must run after listenServer(proxy) — migrate blocks the event loop worker but proxy must already be listening`,
  );
  failed = true;
}
if (vpceEnvIdx !== -1 && listenIdx !== -1 && vpceEnvIdx < listenIdx) {
  console.error(`${entrypointPath}: VPC endpoint env setup must run after listenServer(proxy)`);
  failed = true;
}

if (!/method === "GET" \|\| method === "HEAD"/.test(source)) {
  console.error(`${entrypointPath}: must accept HEAD for App Runner liveness`);
  failed = true;
}

if (!/\/api\/v1\/health\/live\/"/.test(source)) {
  console.error(`${entrypointPath}: must accept trailing slash on /api/v1/health/live/`);
  failed = true;
}

if (!/isAppRunnerLiveProbe\(req\)[\s\S]*?return;/.test(source)) {
  console.error(
    `${entrypointPath}: createUpstreamProxy must answer liveness locally — never forward /health/live to Nest during boot`,
  );
  failed = true;
}

const loadSecretFn = source.match(/async function loadDbSecretFromArn[\s\S]*?^}/m);
if (loadSecretFn && /process\.exit\s*\(\s*1\s*\)/.test(loadSecretFn[0])) {
  console.error(`${entrypointPath}: loadDbSecretFromArn must not process.exit`);
  failed = true;
}

const migrateFn = source.match(/async function runMigrateWithRetry[\s\S]*?^}/m);
if (migrateFn && /process\.exit/.test(migrateFn[0])) {
  console.error(
    `${entrypointPath}: runMigrateWithRetry must not process.exit — a failed prisma migrate deploy must not kill the :3000 proxy`,
  );
  failed = true;
}

if (!/await listenServer\s*\(\s*proxy[\s\S]*?proxyListening\s*=\s*true/.test(mainBody)) {
  console.error(
    `${entrypointPath}: set proxyListening after listenServer so post-boot fatals do not exit before App Runner stabilizes`,
  );
  failed = true;
}

if (/handoffToProxy|health-sidecar/.test(source)) {
  console.error(
    `${entrypointPath}: must not hand off or rebind :3000 — a single boot proxy must stay bound for the entire deploy window`,
  );
  failed = true;
}

if (failed) process.exit(1);

console.log("check-boot-proxy-order: OK");
