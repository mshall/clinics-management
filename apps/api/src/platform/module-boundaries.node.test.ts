import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import {
  contextForTopLevelFolder,
  isCrossContextImportAllowed,
  type BoundedContextId,
} from "./module-contexts";

const SRC_ROOT = join(process.cwd(), "src");

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      listTsFiles(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function topLevelFolder(absolutePath: string): string | null {
  const rel = relative(SRC_ROOT, absolutePath);
  const seg = rel.split(/[/\\]/)[0];
  return seg && !seg.includes(".") ? seg : null;
}

/** Resolve `from "../foo/bar"` relative to the importing file's folder. */
function resolveRelativeImport(importerFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const parts = importerFile.replace(/\\/g, "/").split("/");
  parts.pop();
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  let target = parts.join("/");
  if (!target.endsWith(".ts")) {
    if (statSync(target + ".ts", { throwIfNoEntry: false })) target += ".ts";
    else if (statSync(join(target, "index.ts"), { throwIfNoEntry: false })) target = join(target, "index.ts");
  }
  try {
    statSync(target);
    return target;
  } catch {
    return null;
  }
}

const IMPORT_RE = /from\s+["']([^"']+)["']/g;

test("API src tree maps to known bounded contexts", () => {
  const files = listTsFiles(SRC_ROOT);
  const unknownFolders = new Set<string>();
  for (const f of files) {
    const folder = topLevelFolder(f);
    if (!folder || folder === "platform") continue;
    const ctx = contextForTopLevelFolder(folder);
    if (!ctx) unknownFolders.add(folder);
  }
  assert.equal(
    unknownFolders.size,
    0,
    `Register new top-level modules in platform/module-contexts.ts: ${[...unknownFolders].join(", ")}`,
  );
});

test("cross-context relative imports follow allowed dependency edges", () => {
  const violations: string[] = [];
  const files = listTsFiles(SRC_ROOT).filter((f) => !f.includes(".node.test.ts"));

  for (const file of files) {
    const sourceFolder = topLevelFolder(file);
    if (!sourceFolder) continue;
    const sourceCtx = contextForTopLevelFolder(sourceFolder);
    if (!sourceCtx || sourceCtx === "composition") continue;

    const content = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(content)) !== null) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue;
      const targetFile = resolveRelativeImport(file, spec);
      if (!targetFile) continue;
      const targetFolder = topLevelFolder(targetFile);
      if (!targetFolder || targetFolder === sourceFolder) continue;
      const targetCtx = contextForTopLevelFolder(targetFolder);
      if (!targetCtx) continue;
      if (!isCrossContextImportAllowed(sourceCtx, targetCtx)) {
        violations.push(
          `${relative(SRC_ROOT, file)} (${sourceCtx}) -> ${targetFolder} (${targetCtx}) via "${spec}"`,
        );
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Disallowed cross-context imports (extract a service or add an allowed edge in module-contexts.ts):\n${violations.slice(0, 40).join("\n")}${
      violations.length > 40 ? `\n… and ${violations.length - 40} more` : ""
    }`,
  );
});

test("composition root only wires modules", () => {
  const appModule = readFileSync(join(SRC_ROOT, "app.module.ts"), "utf8");
  assert.doesNotMatch(appModule, /FiscalDevicesModule/);
  const allowedCompositionImport = /from\s+["']\.\//;
  const bad = [...appModule.matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)];
  assert.equal(bad.length, 0, "app.module.ts should only import Nest modules from ./");
  assert.ok(allowedCompositionImport.test(appModule));
});