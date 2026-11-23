import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ar, en } from "./kiorex-connect-strings";

const here = dirname(fileURLToPath(import.meta.url));
const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

describe("Connect to Kiorex wizard (web)", () => {
  it("Arabic and English bundles have identical keys and no empty strings", () => {
    assert.deepEqual(flat(en).sort(), flat(ar).sort());
    for (const v of [...flat(en), ...flat(ar)]) assert.ok(v.length > 0);
  });
  it("every static kiorexConnect key used by the wizard files exists in both languages", () => {
    const keys = new Set(flat(en));
    const used = new Set<string>();
    for (const f of readdirSync(here).filter((x) => /^kiorex-connect.*\.tsx$/.test(x))) {
      for (const m of readFileSync(join(here, f), "utf8").matchAll(/\bt\(\s*["'`](kiorexConnect\.[a-zA-Z0-9_.]+)["'`]/g)) used.add(m[1]!.replace("kiorexConnect.", ""));
    }
    assert.ok(used.size > 10);
    assert.deepEqual([...used].filter((k) => !keys.has(k)), []);
  });
  it("covers every API step key and status in both languages", () => {
    for (const k of ["subscription", "entitlement", "credentials", "appointment_types", "availability", "profile", "consent", "options", "request", "live"]) {
      assert.ok((en.step as Record<string, unknown>)[k] && (ar.step as Record<string, unknown>)[k], k);
    }
    for (const s of ["done", "action_needed", "waiting_kiorex", "blocked"]) assert.ok((en.state as Record<string, string>)[s]);
  });
  it("uses brand tokens and logical (RTL-safe) layout, no hard-coded colours", () => {
    for (const f of readdirSync(here).filter((x) => /^kiorex-connect.*\.tsx$/.test(x))) {
      const src = readFileSync(join(here, f), "utf8");
      assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b/, `${f} hard-coded hex`);
      assert.doesNotMatch(src, /\b(ml|mr|pl|pr|text-left|text-right)-/, `${f} uses physical direction classes`);
    }
  });
  it("never states a price: the fee comes from the published market config", () => {
    assert.doesNotMatch(JSON.stringify(en) + JSON.stringify(ar), /EGP\s*\d|\d+\s*جنيه/);
  });
});
