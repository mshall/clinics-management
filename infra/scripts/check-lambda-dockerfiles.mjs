#!/usr/bin/env node
/**
 * Lambda container images must keep the default LAMBDA_TASK_ROOT (/var/task) and expose
 * index.mjs with CMD ["index.handler"]. Overriding LAMBDA_TASK_ROOT makes the RIC fail with
 * Runtime.ImportModuleError: Cannot find module 'index'.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dockerfiles = [
  join(repoRoot, "apps/api/Dockerfile.seed"),
  join(repoRoot, "infra/lambda/db-backup/Dockerfile"),
];

let failed = false;

for (const path of dockerfiles) {
  const content = readFileSync(path, "utf8");
  if (/^\s*ENV\s+LAMBDA_TASK_ROOT=/m.test(content)) {
    console.error(`${path}: must not override LAMBDA_TASK_ROOT (use default /var/task)`);
    failed = true;
  }
  if (!/^\s*CMD\s+\["index\.handler"\]/m.test(content)) {
    console.error(`${path}: must set CMD ["index.handler"] for the Lambda RIC`);
    failed = true;
  }
  if (!/index\.mjs/.test(content)) {
    console.error(`${path}: must copy handler to \${LAMBDA_TASK_ROOT}/index.mjs`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check-lambda-dockerfiles: OK");
