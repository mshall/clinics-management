import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");
const ETA_HOST_PATTERNS = [
  /invoicing\.eta\.gov\.eg/i,
  /api\.invoicing\.eta\.gov\.eg/i,
  /id\.eta\.gov\.eg/i,
  /eta-egypt/i,
  /queueFiscalDocument/,
  /FiscalSubmissionWorker/,
  /fiscal-devices\//,
];

function listTs(dir: string, prefix = "", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listTs(full, rel, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

test("FD-02: runtime src has no ETA outbound hosts or fiscal queue workers", () => {
  const offenders: string[] = [];
  for (const rel of listTs(SRC)) {
    if (rel.endsWith(".node.test.ts") || rel.endsWith(".integration.test.ts")) continue;
    if (rel.includes("prisma/seed")) continue;
    const text = readFileSync(join(SRC, rel), "utf8");
    if (ETA_HOST_PATTERNS.some((p) => p.test(text))) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("FD-02: creating a clinic does not provision fiscal devices", () => {
  const clinics = readFileSync(join(SRC, "clinics/clinics.service.ts"), "utf8");
  assert.doesNotMatch(clinics, /fiscalDeviceProvisioning|FiscalDevice/);
});