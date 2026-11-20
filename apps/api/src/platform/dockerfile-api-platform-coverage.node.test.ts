import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/** `npm run test:unit -w api` uses cwd `apps/api`. */
const apiRoot = process.cwd();
const dockerfile = path.join(apiRoot, "Dockerfile");
const repoRoot = path.join(apiRoot, "..", "..");

/**
 * Platform JSON registries the Nest API loads at runtime via repo-root walk
 * (data-cells, PDPC filings, SES domain auth). App Runner images must ship them.
 */
const RUNTIME_PLATFORM_FILES = [
  "data-cells.json",
  "pdpc-egypt-filings.json",
  "email-domain-auth.json",
] as const;

function dockerfileCopiesPlatformFile(fileName: string): boolean {
  const text = fs.readFileSync(dockerfile, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("COPY ")) continue;
    // Whole directory: `COPY platform ./platform` or `COPY platform/ ./platform/`
    if (/^COPY\s+platform\/?\s+/.test(trimmed)) return true;
    // Explicit files: `COPY platform/data-cells.json … ./platform/`
    if (trimmed.includes(`platform/${fileName}`)) return true;
  }
  return false;
}

describe("API Dockerfile ships platform runtime registries", () => {
  it("each runtime platform JSON exists in the repo", () => {
    for (const file of RUNTIME_PLATFORM_FILES) {
      const p = path.join(repoRoot, "platform", file);
      assert.ok(fs.existsSync(p), `missing ${p}`);
    }
  });

  it("apps/api/Dockerfile COPY includes each runtime platform JSON", () => {
    const missing = RUNTIME_PLATFORM_FILES.filter((f) => !dockerfileCopiesPlatformFile(f));
    assert.deepEqual(
      missing,
      [],
      `Add COPY platform/<file> to apps/api/Dockerfile for: ${missing.join(", ") || "(none)"}`,
    );
  });
});
