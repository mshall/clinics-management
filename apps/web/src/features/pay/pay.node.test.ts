import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { payAr, payEn } from "./pay-strings";
import { stateTone } from "./pay-logic";

const keys = (o: unknown, p = ""): string[] => (o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);

describe("Pay screens wording and tones", () => {
  it("Arabic has every English key (no raw key can show in RTL) and the same {{placeholders}}", () => {
    assert.deepEqual(keys(payAr).sort(), keys(payEn).sort());
    const flat = (o: unknown, p = ""): [string, string][] => (typeof o === "string" ? [[p, o]] : Object.entries(o as object).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)));
    const en = new Map(flat(payEn)); const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const [k, v] of flat(payAr)) assert.equal(ph(v), ph(en.get(k)!), k);
  });
  it("says Kiorly does not hold funds, in both languages", () => {
    assert.match(payEn.principle, /does not hold funds/); assert.match(payAr.principle, /لا تحتفظ بأي أموال/);
  });
  it("states are toned: paid green, waiting amber, stopped red", () => {
    assert.equal(stateTone("CAPTURED"), "good"); assert.equal(stateTone("OPEN"), "warn"); assert.equal(stateTone("EXPIRED"), "bad"); assert.equal(stateTone("other"), "info");
  });
});
