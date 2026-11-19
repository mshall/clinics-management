import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

/**
 * ADR-011 / FD-02 (founder decision, reaffirmed 19 Nov 2026): NO product integrates with, submits to, or reports to
 * any tax authority. Clinics, doctors, pharmacies and labs file their own taxes. Allowed: configurable VAT lines on
 * Kiorly's own invoices and printed payment records, and CSV/PDF exports for the business's accountant.
 *
 * This test fails if runtime code (API, web, scripts) references tax-authority submission: ETA / e-invoice /
 * e-receipt, ZATCA / FTA / Fatoora, fiscal queues, devices, documents or submissions. Tests, migrations and docs are
 * excluded; the few justified legacy references live in {@link ALLOWED} with the reason.
 */
const API_ROOT = join(__dirname, "../..");
const REPO_ROOT = join(API_ROOT, "../..");

const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: "ETA (Egyptian Tax Authority)", re: /\bETA\b/ },
  { name: "ETA_* env / config", re: /\bETA_[A-Z0-9_]+/ },
  { name: "e-invoice / e-receipt", re: /(^|[^A-Za-z])e[-_]?(invoic(e|es|ing)|receipts?)/i },
  { name: "camelCase eReceipt / eInvoice", re: /[a-z]E(Receipt|Invoice)/ },
  { name: "ZATCA / FTA / Fatoora", re: /zatca|fatoora|\bFTA\b|fta\.gov/i },
  { name: "tax-authority API host", re: /invoicing\.eta|eta\.gov|id\.eta\./i },
  { name: "ETA client / UUID submission", re: /etaUuid|eta-egypt|EtaClient|submitToEta|etaSubmission|referenceOldUUID/i },
  { name: "fiscal queue / device / document / submission", re: /fiscal(Submission|Device|Document|PosChain)|queueFiscal|fiscal-devices|FiscalSubmissionWorker/i },
  { name: "data sent to a tax authority", re: /(sent|submitted|reported|transmitted)\s+to\s+(the\s+)?(\w+\s+)?tax authority/i },
  { name: "tax compliance status UI", re: /tax[ _-]?compliance[ _-]?status/i },
];

/** Identifiers stripped before matching: legacy API field names with no tax-authority behaviour. */
const LEGACY_IDENTIFIERS = [/skipEtaEReceipt(Reason)?/g];

/** relative path (from repo root) -> why it may mention the term. Keep this list short; it must only shrink. */
const ALLOWED: Record<string, string> = {
  "apps/api/src/admin/data-explorer/admin-data-explorer.service.ts":
    "read-only guard: refuses to delete revenue still linked to a legacy fiscal document row (tables retained, FD-02)",
  "apps/api/src/staging/sales-demo-reset.ts": "wipes legacy fiscal rows in the sales demo tenant (tables retained read-only, FD-02)",
  "apps/api/src/legal/legal-pack-content.ts":
    "STALE LEGAL COPY mentioning the Egyptian Tax Authority; legal wording needs a human (Docs/KIORLY_NEEDS_HUMAN.md NH-024)",
  "scripts/assert-single-visit-fee.mjs": "legacy dev assertion script over retained fiscal tables",
};

const SCAN_ROOTS = [
  join(REPO_ROOT, "apps/api/src"),
  join(REPO_ROOT, "apps/api/scripts"),
  join(REPO_ROOT, "apps/web/src"),
  join(REPO_ROOT, "scripts"),
];
const SKIP_DIR = new Set(["node_modules", "dist", ".data", "gen"]);
const EXT = /\.(ts|tsx|js|mjs|cjs|json)$/;
const SKIP_FILE = /(\.node\.test\.ts|\.integration\.test\.ts|\.test\.tsx?|\.spec\.tsx?|\.gen\.ts|\.d\.ts)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name) && !SKIP_FILE.test(name)) out.push(full);
  }
  return out;
}

export function findTaxAuthorityReferences(text: string): string[] {
  let t = text;
  for (const id of LEGACY_IDENTIFIERS) t = t.replace(id, "");
  const hits: string[] = [];
  t.split("\n").forEach((line, i) => {
    if (line.includes("no-tax-authority:allow")) return;
    for (const f of FORBIDDEN) if (f.re.test(line)) hits.push(`${i + 1}: [${f.name}] ${line.trim().slice(0, 120)}`);
  });
  return hits;
}

describe("no-tax-authority (ADR-011): clinics and doctors file their own taxes", () => {
  it("runtime code has no ETA / e-invoice / e-receipt / ZATCA / fiscal submission references", () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
        if (ALLOWED[rel]) continue;
        const hits = findTaxAuthorityReferences(readFileSync(file, "utf8"));
        for (const h of hits) offenders.push(`${rel}:${h}`);
      }
    }
    assert.deepEqual(offenders, [], `Tax-authority references are forbidden (ADR-011):\n${offenders.join("\n")}`);
  });

  it("the allow-list only names files that still exist and still need the exception", () => {
    for (const [rel, why] of Object.entries(ALLOWED)) {
      const file = join(REPO_ROOT, rel);
      assert.ok(existsSync(file), `stale allow-list entry (file gone): ${rel}`);
      assert.ok(why.length > 20, `${rel} needs a reason`);
      assert.ok(findTaxAuthorityReferences(readFileSync(file, "utf8")).length > 0, `${rel} no longer needs an exception: remove it`);
    }
  });

  it("the detector catches the references it exists to catch", () => {
    for (const bad of [
      'const url = "https://api.invoicing.eta.gov.eg/api/v1";',
      "await submitEReceipt(doc)",
      "queueFiscalDocument(tx, id)",
      "const x = ETA_API_BASE_URL;",
      "// ZATCA e-invoice clearance",
      "const e_invoice = 1",
      "prisma.fiscalSubmission.create({})",
      "referenceOldUUID: uuid",
    ]) {
      assert.ok(findTaxAuthorityReferences(bad).length > 0, bad);
    }
    for (const ok of [
      "const vatPercent = 14; // VAT line on our own invoice",
      "createInvoice(dto)",
      "const beta = 1; const metadata = {};",
      "export as CSV for your accountant",
      "skipEtaEReceiptReason?: string;",
    ]) {
      assert.deepEqual(findTaxAuthorityReferences(ok), [], ok);
    }
  });

  it("VAT stays plain config: invoice VAT comes from clinic/market settings and pure math, with CSV/PDF output only", () => {
    const vat = readFileSync(join(API_ROOT, "src/common/vat-breakdown.ts"), "utf8");
    assert.match(vat, /computeVatInclusiveBreakdown/);
    assert.doesNotMatch(vat, /fetch\(|axios|http/);
    // No module that computes or prints VAT may open an outbound HTTP connection to a tax authority.
    for (const rel of ["src/billing-platform/monthly-statement.ts", "src/common/vat-breakdown.ts", "src/common/invoice-config.ts"]) {
      const f = join(API_ROOT, rel);
      if (!existsSync(f)) continue;
      assert.doesNotMatch(readFileSync(f, "utf8"), /\bfetch\(|from "node:https?"|axios/, rel);
    }
  });

  it("Docs/NO_TAX_AUTHORITY_REPORTING.md exists and is linked from the Docs hub and the help centre", () => {
    const doc = join(REPO_ROOT, "Docs/NO_TAX_AUTHORITY_REPORTING.md");
    assert.ok(existsSync(doc), "Docs/NO_TAX_AUTHORITY_REPORTING.md is missing");
    assert.match(readFileSync(doc, "utf8"), /file their own taxes/i);
    assert.match(readFileSync(join(REPO_ROOT, "Docs/README.md"), "utf8"), /NO_TAX_AUTHORITY_REPORTING\.md/);
    assert.match(readFileSync(join(REPO_ROOT, "Docs/HELP_CENTRE.md"), "utf8"), /NO_TAX_AUTHORITY_REPORTING\.md/);
  });
});
