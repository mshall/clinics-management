import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");

/** Files allowed to call `revenueEntry.create`. */
const ALLOWED_REVENUE_CREATORS = new Set(["compliance/post-revenue.ts", "common/visit-fee-ledger.ts"]);

/** Files allowed to delete / void-update posted revenue outside helpers (narrow exceptions). */
const ALLOWED_REVENUE_MUTATORS = new Set([
  ...ALLOWED_REVENUE_CREATORS,
  "compliance/void-revenue-adjustments.ts",
  "compliance/operation-revenue-ledger.ts",
  "compliance/fiscal-queue.ts",
  "admin/data-explorer/admin-data-explorer.service.ts",
  "staging/sales-demo-reset.ts",
]);

const REVENUE_MUTATION_PATTERNS = [
  /revenueEntry\.create\s*\(/,
  /revenueEntry\.delete\s*\(/,
  /revenueEntry\.deleteMany\s*\(/,
  /revenueEntry\.updateMany\s*\(/,
  /revenueEntry\.update\s*\(/,
] as const;

function listTsFiles(dir: string, prefix = "", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listTsFiles(full, rel, out);
    else if (
      name.endsWith(".ts") &&
      !name.endsWith(".node.test.ts") &&
      !name.endsWith(".integration.test.ts") &&
      !name.endsWith(".d.ts")
    )
      out.push(rel);
  }
  return out;
}

function fileTouchesRevenueMutation(text: string): boolean {
  return REVENUE_MUTATION_PATTERNS.some((p) => p.test(text));
}

test("posted revenue is created only through postRevenue helpers", () => {
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
    `These files create RevenueEntry without postRevenue/visit-fee-ledger: ${offenders.join(", ")}`,
  );
});

test("revenue entry mutations stay in approved fiscal modules", () => {
  const offenders: string[] = [];
  for (const rel of listTsFiles(SRC)) {
    if (rel.includes("prisma/seed")) continue;
    const text = readFileSync(join(SRC, rel), "utf8");
    if (!fileTouchesRevenueMutation(text)) continue;
    if (!ALLOWED_REVENUE_MUTATORS.has(rel)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `These files mutate RevenueEntry outside approved helpers: ${offenders.join(", ")}`,
  );
});