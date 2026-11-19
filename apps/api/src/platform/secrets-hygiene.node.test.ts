import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, it } from "node:test";

/** SC-06 — fail CI if obvious live secrets appear in tracked source. */
/** apps/api/src/platform → repo root */
const ROOT = join(__dirname, "../../../..");
const SCAN_ROOTS = ["apps/api/src", "apps/web/src", "infra", "platform"];
const SKIP_DIR = new Set(["node_modules", "dist", ".git", "coverage", ".data", "pgdata", ".pgdata"]);

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "generic private key header", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Stripe live secret", re: /sk_live_[0-9a-zA-Z]{10,}/ },
  { name: "GitHub PAT", re: /ghp_[0-9a-zA-Z]{20,}/ },
];

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (
      /\.(ts|tsx|js|json|yml|yaml|tf|sh)$/.test(name) &&
      !name.endsWith(".node.test.ts") &&
      !name.endsWith(".example")
    ) {
      out.push(p);
    }
  }
}

describe("SC-06 secrets hygiene", () => {
  it("source tree has no hardcoded live secrets", () => {
    const files: string[] = [];
    for (const rel of SCAN_ROOTS) walk(join(ROOT, rel), files);
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const { name, re } of PATTERNS) {
        if (re.test(text)) hits.push(`${name}: ${file}`);
      }
    }
    assert.deepEqual(hits, [], hits.join("\n"));
  });
});
