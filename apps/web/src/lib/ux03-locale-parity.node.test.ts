import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const EN = JSON.parse(readFileSync(join(ROOT, "locales/en.json"), "utf8")) as unknown;
const AR = JSON.parse(readFileSync(join(ROOT, "locales/ar.json"), "utf8")) as unknown;

function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flattenKeys(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

/** i18next plural suffixes allowed only on AR when the base key exists in EN. */
function isArabicPluralExtra(key: string, enKeys: Set<string>): boolean {
  const m = key.match(/^(.*)_(zero|one|two|few|many|other)$/);
  if (!m) return false;
  return enKeys.has(m[1]!) || enKeys.has(`${m[1]}_one`) || enKeys.has(`${m[1]}_other`);
}

describe("UX-03 Arabic RTL & locale parity", () => {
  it("ar.json has every en.json key (zero untranslated keys)", () => {
    const enKeys = new Set(flattenKeys(EN));
    const arKeys = new Set(flattenKeys(AR));
    const missingInAr = [...enKeys].filter((k) => !arKeys.has(k)).sort();
    const unexpectedExtra = [...arKeys]
      .filter((k) => !enKeys.has(k) && !isArabicPluralExtra(k, enKeys))
      .sort();
    assert.deepEqual(missingInAr, [], `Missing in ar.json: ${missingInAr.slice(0, 20).join(", ")}`);
    assert.deepEqual(unexpectedExtra, [], `Unexpected extra in ar.json: ${unexpectedExtra.slice(0, 20).join(", ")}`);
  });

  it("leaf string values in ar.json are non-empty", () => {
    const empty: string[] = [];
    function walk(obj: unknown, prefix = "") {
      if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") {
          if (!v.trim()) empty.push(path);
        } else {
          walk(v, path);
        }
      }
    }
    walk(AR);
    assert.deepEqual(empty, [], `Empty AR strings: ${empty.slice(0, 20).join(", ")}`);
  });

  it("Arabic numerals preference helpers exist", () => {
    const src = readFileSync(join(ROOT, "lib/arabic-numerals.ts"), "utf8");
    assert.match(src, /nu-arab/);
    assert.match(src, /ar-EG/);
  });

  it("localeForLanguage uses Egyptian ar-EG not Gulf ar-AE", () => {
    const src = readFileSync(join(ROOT, "lib/locale-display.ts"), "utf8");
    assert.match(src, /ar-EG/);
    assert.doesNotMatch(src, /ar-AE/);
  });

  it("deploy version banner keys exist in EN and AR", () => {
    const enApp = (EN as { app: Record<string, string> }).app;
    const arApp = (AR as { app: Record<string, string> }).app;
    const enCommon = (EN as { common: Record<string, string> }).common;
    const arCommon = (AR as { common: Record<string, string> }).common;
    assert.equal(typeof enApp.newVersionAvailable, "string");
    assert.equal(typeof arApp.newVersionAvailable, "string");
    assert.match(arApp.newVersionAvailable, /[\u0600-\u06FF]/);
    assert.equal(typeof enApp.reloadNow, "string");
    assert.equal(typeof arApp.reloadNow, "string");
    assert.match(arApp.reloadNow, /[\u0600-\u06FF]/);
    assert.equal(typeof enCommon.later, "string");
    assert.equal(typeof arCommon.later, "string");
    assert.match(arCommon.later, /[\u0600-\u06FF]/);
  });
});
