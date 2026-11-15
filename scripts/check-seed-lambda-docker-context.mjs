#!/usr/bin/env node
/** Ensure Dockerfile.seed COPY lines cover every prisma/seed.ts import from ../src/… */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "apps/api/prisma/seed.ts");
const dockerPath = path.join(root, "apps/api/Dockerfile.seed");

const seed = fs.readFileSync(seedPath, "utf8");
const docker = fs.readFileSync(dockerPath, "utf8");

const srcImports = [...seed.matchAll(/from\s+["']\.\.\/src\/([^"']+)["']/g)].map((m) => m[1]);
const missing = srcImports.filter((rel) => {
  const file = rel.endsWith(".ts") ? rel : `${rel}.ts`;
  return !docker.includes(`apps/api/src/${file}`);
});

if (missing.length > 0) {
  console.error(
    "check-seed-lambda-docker-context: Dockerfile.seed missing COPY for prisma/seed.ts imports:",
    missing.join(", "),
  );
  process.exit(1);
}

console.log("check-seed-lambda-docker-context: OK");