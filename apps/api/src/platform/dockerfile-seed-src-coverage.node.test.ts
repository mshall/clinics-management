import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/** `npm run test:unit -w api` uses cwd `apps/api`. */
const apiRoot = process.cwd();
const dockerfile = path.join(apiRoot, "Dockerfile.seed");
const prismaDir = path.join(apiRoot, "prisma");

const IMPORT_RE = /from\s+["']\.\.\/src\/([^"']+)["']/g;

function prismaSrcImports(): string[] {
  const files = fs.readdirSync(prismaDir).filter((f) => f.endsWith(".ts"));
  const out = new Set<string>();
  for (const file of files) {
    const text = fs.readFileSync(path.join(prismaDir, file), "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const rel = match[1]!.replace(/\.ts$/, "");
      out.add(rel);
    }
  }
  return [...out].sort();
}

/** COPY sources from Dockerfile.seed that map into Lambda `src/`. */
function dockerfileCoveredRelPaths(): { files: Set<string>; dirs: Set<string> } {
  const text = fs.readFileSync(dockerfile, "utf8");
  const files = new Set<string>();
  const dirs = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^COPY\s+apps\/api\/src\/(\S+)\s+/);
    if (!m) continue;
    const src = m[1]!;
    if (src.endsWith(".ts")) {
      files.add(src.replace(/\.ts$/, ""));
    } else {
      dirs.add(src.replace(/\/$/, ""));
    }
  }
  return { files, dirs };
}

function isCovered(importRel: string, cov: { files: Set<string>; dirs: Set<string> }): boolean {
  if (cov.files.has(importRel)) return true;
  for (const dir of cov.dirs) {
    if (importRel === dir || importRel.startsWith(`${dir}/`)) return true;
  }
  return false;
}

describe("DbSeed Lambda Dockerfile.seed covers prisma ../src imports", () => {
  it("every prisma ../src import has a COPY line", () => {
    const imports = prismaSrcImports();
    const cov = dockerfileCoveredRelPaths();
    const missing = imports.filter((imp) => !isCovered(imp, cov));
    assert.deepEqual(
      missing,
      [],
      `Add COPY to apps/api/Dockerfile.seed for: ${missing.join(", ") || "(none)"}`,
    );
  });
});