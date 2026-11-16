import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");

/** Files allowed to call `revenueEntry.create` (must also queue fiscal or use postRevenueWithFiscal). */
const ALLOWED_REVENUE_CREATORS = new Set([
  "compliance/post-revenue-with-fiscal.ts",
  "common/visit-fee-ledger.ts",
]);

function listTsFiles(dir: string, prefix = "", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listTsFiles(full, rel, out);
    else if (name.endsWith(".ts") && !name.endsWith(".node.test.ts") && !name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

test("posted revenue is created only through fiscal-aware helpers", () => {
  const offenders: string[] = [];
  for (const rel of listTsFiles(SRC)) {
    const text = readFileSync(join(SRC, rel), "utf8");
    if (!text.includes("revenueEntry.create")) continue;
    if (rel.includes("prisma/seed")) continue;
    if (!ALLOWED_REVENUE_CREATORS.has(rel)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `These files create RevenueEntry without postRevenueWithFiscal/visit-fee-ledger: ${offenders.join(", ")}`,
  );
});