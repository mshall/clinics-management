import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * OpenAPI conformance of the committed Clinic document (the regenerated copy is compared in CI by the drift step; Redocly lint runs there too). This is the cheap in-process version:
 * every `{param}` of a path is declared, operationIds are unique, every `$ref` resolves, every path starts with a slash and has no trailing slash.
 */
type Doc = { paths: Record<string, Record<string, { operationId?: string; parameters?: { name: string; in: string; $ref?: string }[] }>>; components?: Record<string, Record<string, unknown>> };
const doc = JSON.parse(readFileSync(join(__dirname, "../openapi/openapi.json"), "utf8")) as Doc;
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch"];

describe("Clinic OpenAPI document conformance", () => {
  it("every path parameter is declared by the operation or the path item", () => {
    const bad: string[] = [];
    for (const [path, item] of Object.entries(doc.paths)) {
      const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
      const shared = ((item as unknown as { parameters?: { name: string; in: string }[] }).parameters ?? []).filter((p) => p.in === "path").map((p) => p.name);
      for (const m of METHODS) {
        const op = item[m]; if (!op) continue;
        const declared = new Set([...shared, ...(op.parameters ?? []).filter((p) => p.in === "path").map((p) => p.name)]);
        for (const n of names) if (!declared.has(n)) bad.push(`${m.toUpperCase()} ${path} {${n}}`);
      }
    }
    assert.deepEqual(bad, []);
  });
  it("operationIds are unique and paths are well formed", () => {
    const seen = new Map<string, string>(); const dup: string[] = [];
    for (const [path, item] of Object.entries(doc.paths)) {
      assert.ok(path.startsWith("/") && (path === "/" || !path.endsWith("/")), path);
      for (const m of METHODS) { const id = item[m]?.operationId; if (!id) continue; if (seen.has(id)) dup.push(`${id}: ${seen.get(id)} and ${m} ${path}`); else seen.set(id, `${m} ${path}`); }
    }
    assert.deepEqual(dup, []);
  });
  it("every $ref resolves inside the document", () => {
    const text = readFileSync(join(__dirname, "../openapi/openapi.json"), "utf8");
    const refs = new Set([...text.matchAll(/"\$ref":\s*"#\/([^"]+)"/g)].map((m) => m[1]!));
    const missing = [...refs].filter((r) => { let n: unknown = doc; for (const part of r.split("/")) { if (!n || typeof n !== "object") return true; n = (n as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")]; } return n === undefined; });
    assert.deepEqual(missing, []);
  });
});
