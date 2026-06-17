#!/usr/bin/env node
/**
 * App Runner health-checks PORT (3000) during deploy. docker-entrypoint.mjs must bind the
 * boot proxy on PORT before any VPC Secrets Manager fetch or Prisma migrate — otherwise
 * probes get connection refused and App Runner rolls back in ~40s.
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

if (/^import\s+.*@aws-sdk\/client-secrets-manager/m.test(source)) {
  console.error(
    `${entrypointPath}: do not statically import @aws-sdk/client-secrets-manager — dynamic import after listen keeps :3000 up during cold module load`,
  );
  process.exit(1);
}

const mainMatch = source.match(/async function main\(\)\s*\{([\s\S]*?)\n\}/);
if (!mainMatch) {
  if (/^const dbSecretArn\s*=|^if\s*\(\s*dbSecretArn\s*\)/m.test(source)) {
    console.error(
      `${entrypointPath}: DB secret fetch at module top level blocks the :3000 proxy — wrap boot in async function main() and listen on PORT first`,
    );
  } else {
    console.error(`${entrypointPath}: missing async function main()`);
  }
  process.exit(1);
}

const mainBody = mainMatch[1];
const listenIdx = mainBody.search(/await listenServer\s*\(\s*proxy/);
const secretIdx = mainBody.search(/await loadDbSecretFromArn\s*\(/);
const migrateIdx = mainBody.search(/await runMigrate\s*\(/);
const vpceEnvIdx = mainBody.search(/AWS_ENDPOINT_URL_SECRETS_MANAGER/);

let failed = false;

if (listenIdx === -1) {
  console.error(`${entrypointPath}: main() must await listenServer(proxy, …) before boot work`);
  failed = true;
}
if (secretIdx !== -1 && listenIdx !== -1 && secretIdx < listenIdx) {
  console.error(
    `${entrypointPath}: loadDbSecretFromArn must run after listenServer(proxy) — App Runner needs :3000 up during VPC secret retries`,
  );
  failed = true;
}
if (migrateIdx !== -1 && listenIdx !== -1 && migrateIdx < listenIdx) {
  console.error(
    `${entrypointPath}: runMigrate must run after listenServer(proxy) — migrate blocks the event loop worker but proxy must already be listening`,
  );
  failed = true;
}
if (vpceEnvIdx !== -1 && listenIdx !== -1 && vpceEnvIdx < listenIdx) {
  console.error(
    `${entrypointPath}: VPC endpoint env setup must run after listenServer(proxy) — bind :3000 before any boot work`,
  );
  failed = true;
}
if (/^const dbSecretArn[\s\S]*await listenServer/m.test(source.replace(mainBody, ""))) {
  console.error(
    `${entrypointPath}: DB secret fetch must not run at module top level before main() starts the proxy`,
  );
  failed = true;
}

if (!/method === "GET" \|\| method === "HEAD"/.test(source)) {
  console.error(
    `${entrypointPath}: isAppRunnerLiveProbe must accept HEAD — App Runner liveness probes use HEAD and otherwise get 503`,
  );
  failed = true;
}

const proxyFn = source.match(/function createUpstreamProxy[\s\S]*?^}/m);
if (!proxyFn || !/if\s*\(\s*isAppRunnerLiveProbe\s*\(\s*req\s*\)\s*\)/.test(proxyFn[0])) {
  console.error(
    `${entrypointPath}: createUpstreamProxy must short-circuit isAppRunnerLiveProbe before forwarding — upstream Nest is down during migrate`,
  );
  failed = true;
}

const loadSecretFn = source.match(/async function loadDbSecretFromArn[\s\S]*?^}/m);
if (loadSecretFn && /process\.exit\s*\(\s*1\s*\)/.test(loadSecretFn[0])) {
  console.error(
    `${entrypointPath}: loadDbSecretFromArn must not process.exit — keep the :3000 proxy alive while retrying Secrets Manager`,
  );
  failed = true;
}

const migrateFn = source.match(/async function runMigrate[\s\S]*?^}/m);
if (migrateFn && /process\.exit\s*\(/.test(migrateFn[0])) {
  console.error(
    `${entrypointPath}: runMigrate must not process.exit — a failed migrate deploy must not drop the :3000 liveness proxy`,
  );
  failed = true;
}

if (!/\/api\/v1\/health\/live\/"/.test(source)) {
  console.error(
    `${entrypointPath}: normalizeHealthPath must accept /api/v1/health/live/ — trailing slash otherwise returns 503 to App Runner`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("check-boot-proxy-order: OK");
