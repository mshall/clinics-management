import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/** `npm run test:unit -w api` uses cwd `apps/api`. */
const apiRoot = process.cwd();
const dockerfile = path.join(apiRoot, "Dockerfile.seed");
const prismaDir = path.join(apiRoot, "prisma");

const PRISMA_SRC_IMPORT_RE = /from\s+["']\.\.\/src\/([^"']+)["']/g;
const REL_IMPORT_RE = /from\s+["'](\.\.?\/[^"']+)["']/g;
const srcRoot = path.join(apiRoot, "src");

function prismaSrcImports(): string[] {
  const files = fs.readdirSync(prismaDir).filter((f) => f.endsWith(".ts"));
  const out = new Set<string>();
  for (const file of files) {
    const text = fs.readFileSync(path.join(prismaDir, file), "utf8");
    for (const match of text.matchAll(PRISMA_SRC_IMPORT_RE)) {
      const rel = match[1]!.replace(/\.ts$/, "");
      out.add(rel);
    }
  }
  return [...out].sort();
}

function srcFileForRel(rel: string): string | null {
  const base = path.join(srcRoot, rel);
  if (fs.existsSync(`${base}.ts`)) return `${base}.ts`;
  if (fs.existsSync(`${base}.tsx`)) return `${base}.tsx`;
  if (fs.existsSync(path.join(base, "index.ts"))) return path.join(base, "index.ts");
  return null;
}

/** Follow relative imports under `src/` so Dockerfile.seed COPY stays complete (e.g. staging → config/host-config). */
function transitiveSrcImports(entryImports: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entryImports];
  while (queue.length) {
    const rel = queue.pop()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const filePath = srcFileForRel(rel);
    if (!filePath) continue;
    const fromDir = path.dirname(filePath);
    const text = fs.readFileSync(filePath, "utf8");
    for (const match of text.matchAll(REL_IMPORT_RE)) {
      const spec = match[1]!;
      const resolved = path.normalize(path.join(fromDir, spec));
      const withTs = fs.existsSync(`${resolved}.ts`) ? `${resolved}.ts` : resolved;
      if (!withTs.startsWith(srcRoot)) continue;
      const childRel = path.relative(srcRoot, withTs.replace(/\.tsx?$/, ""));
      if (!seen.has(childRel)) queue.push(childRel);
    }
  }
  return [...seen].sort();
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
  it("every prisma ../src import (and its src relative imports) has a COPY line", () => {
    const imports = transitiveSrcImports(prismaSrcImports());
    const cov = dockerfileCoveredRelPaths();
    const missing = imports.filter((imp) => !isCovered(imp, cov));
    assert.deepEqual(
      missing,
      [],
      `Add COPY to apps/api/Dockerfile.seed for: ${missing.join(", ") || "(none)"}`,
    );
  });
});