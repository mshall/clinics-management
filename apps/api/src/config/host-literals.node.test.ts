import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

/**
 * ADR-059 rule 1: no domain in application code. Runtime code may name a Kiorex/Kiorly host ONLY in the allow-listed config files below
 * (defaults live there and are overridable by environment variables from the service-url registry). A new literal elsewhere fails this test.
 */
const ROOT = join(__dirname, "..", "..", "..", ".."); // clinics-management
export const HOST_RE = /\b(kiorex|kiorly)\.(com|link)\b|cloudfront\.net|book\.kiorex/i;

/** Paths relative to the repository root. Every entry needs a reason. */
export const ALLOWED_FILES: Record<string, string> = {
  "apps/api/src/config/host-config.ts": "API config file: legacy defaults, env-overridable",
  "apps/api/src/staging/pilot-email-domain.ts": "pilot e-mail domain default, kept beside the staging seed because the seed Lambda image copies only src/staging",
  "apps/web/src/lib/host-config.ts": "web config file: legacy defaults, build-time overridable",
  "apps/api/src/auth/dto/login.dto.ts": "OpenAPI example value only (changing it would change the published contract)",
  "apps/web/src/dev/dev-test-users-data.ts": "dev-only quick-pick fixtures (the whole dev/ folder is excluded from production builds)",
};

const SCAN_DIRS = ["apps/api/src", "apps/web/src"];
const SKIP_DIR = new Set(["node_modules", "dist", "e2e", "__snapshots__"]);
const isTest = (f: string): boolean => /\.(test|spec)\.[cm]?[tj]sx?$/.test(f);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIR.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.[cm]?[tj]sx?$/.test(n) && !isTest(n)) out.push(p);
  }
  return out;
}

/** Code part of a line: comment-only lines and trailing ` // comment` are not runtime. */
export function codePart(line: string): string {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return "";
  const i = line.indexOf(" // ");
  return i >= 0 ? line.slice(0, i) : line;
}

export function findHostLiterals(rel: string, text: string): { file: string; line: number; text: string }[] {
  if (ALLOWED_FILES[rel]) return [];
  const hits: { file: string; line: number; text: string }[] = [];
  text.split("\n").forEach((l, i) => { if (HOST_RE.test(codePart(l))) hits.push({ file: rel, line: i + 1, text: l.trim().slice(0, 140) }); });
  return hits;
}

describe("no host literal in runtime code outside the allow-listed config files", () => {
  it("scans apps/api/src and apps/web/src", () => {
    const hits = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).flatMap((f) => findHostLiterals(relative(ROOT, f).split(sep).join("/"), readFileSync(f, "utf8")));
    assert.deepEqual(hits, [], `host literals found; move them to config (apps/api/src/config/host-config.ts or apps/web/src/lib/host-config.ts):\n${hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join("\n")}`);
  });

  it("the scanner itself catches a new literal and ignores comments and allow-listed files", () => {
    assert.equal(findHostLiterals("apps/api/src/x.ts", 'const a = "https://app.kiorly.com";').length, 1);
    assert.equal(findHostLiterals("apps/api/src/x.ts", "const b = \"https://d92iz83i79c05.cloudfront.net\";").length, 1);
    assert.equal(findHostLiterals("apps/api/src/x.ts", 'const c = "https://book.kiorex.com";').length, 1);
    assert.equal(findHostLiterals("apps/api/src/x.ts", "// see https://app.kiorly.com\n * nurse.kiorly.com\nconst d = 1; // kiorly.link").length, 0);
    assert.equal(findHostLiterals("apps/api/src/x.ts", 'const e = "kiorex.commission_charge.created";').length, 0, "audit action names are not hosts");
    assert.equal(findHostLiterals("apps/api/src/config/host-config.ts", 'const f = "app.kiorly.com";').length, 0);
  });

  it("every allow-listed file exists (no stale entries)", () => {
    for (const f of Object.keys(ALLOWED_FILES)) assert.ok(statSync(join(ROOT, f)).isFile(), f);
  });
});
