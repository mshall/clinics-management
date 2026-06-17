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
if (/^const dbSecretArn[\s\S]*await listenServer/m.test(source.replace(mainBody, ""))) {
  console.error(
    `${entrypointPath}: DB secret fetch must not run at module top level before main() starts the proxy`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("check-boot-proxy-order: OK");
