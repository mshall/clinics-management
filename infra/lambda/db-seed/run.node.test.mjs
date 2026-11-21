import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("db-seed uses Prisma 7 db execute (--config, not deprecated --schema)", () => {
  const runPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "run.mjs");
  const src = readFileSync(runPath, "utf8");
  assert.match(src, /"db", "execute", "--stdin", "--config", "prisma\.config\.ts"/);
  assert.doesNotMatch(src, /db.*execute.*--schema/);
});