/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { growthAr, growthEn } from "./growth-strings";
import { RECOMMENDATION_IDS, createLinkError, isKnownRecommendation, lastMonths, originProblems, parseOriginLines, pct } from "./growth-logic";

const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const get = (o: any, path: string): string => path.split(".").reduce((x: any, p) => x[p], o);

describe("Growth workspace wording", () => {
  it("English and Arabic have identical keys, no empty values and the same placeholders", () => {
    assert.deepEqual(flat(growthEn).sort(), flat(growthAr).sort());
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const k of flat(growthEn)) {
      const e = get(growthEn, k);
      const a = get(growthAr, k);
      assert.ok(e.length > 0 && a.length > 0, k);
      assert.equal(ph(e), ph(a), k);
    }
  });
  it("Arabic wording is Arabic: Latin appears only in protocol, file and example tokens", () => {
    const allowed = new Set(["qr", "svg", "png", "pdf", "iframe", "vcf", "ramadan", "https", "www", "myclinic", "com", "a4", "a5"]);
    for (const k of flat(growthAr)) {
      const words = get(growthAr, k).replace(/\{\{\w+\}\}/g, "").match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
      for (const w of words) assert.ok(allowed.has(w.toLowerCase()), `${k}: ${w}`);
    }
  });
  it("the promise is stated and the fee is never described as removable by anything but evidence", () => {
    assert.match(growthEn.promise, /never carry a Kiorex fee/);
    assert.match(growthEn.promiseDetail, /Evidence can remove a fee, never add one/);
  });
  it("guardrail: recommendations never encourage over-treatment, price pressure or testimonial tactics (EN and AR)", () => {
    const forbiddenEn = /upsell|more procedures|extra procedure|add procedures? to|increase (your )?fees?|raise (your )?prices?|testimonial|fake review|buy reviews|incentivi[sz]e reviews|discount|promotion|limited offer|treat more/i;
    const forbiddenAr = /شهادات مدفوعة|تقييمات مزيفة|شراء تقييمات|عروض|خصم|رفع الأسعار|إجراءات إضافية|علاجات إضافية/;
    for (const id of RECOMMENDATION_IDS) {
      assert.doesNotMatch(growthEn.rec.items[id], forbiddenEn, id);
      assert.doesNotMatch(growthAr.rec.items[id], forbiddenAr, id);
    }
    assert.deepEqual(Object.keys(growthEn.rec.items).sort(), [...RECOMMENDATION_IDS].sort(), "wording exists for exactly the catalogue");
    assert.match(growthEn.rec.guardrail, /never ask you to add procedures/);
  });
});

describe("Growth workspace logic", () => {
  it("origin lines: one per line, validated like the contract and the server, with the exact line number", () => {
    const lines = parseOriginLines("https://www.a.com\n\n  https://b.example.org:8443  \nhttp://c.com\nhttps://*.d.com\nhttps://e.com/path\nhttps://localhost\nhttps://www.a.com\n");
    assert.deepEqual(originProblems(lines).map((p) => [p.line, p.problem]), [[3, "NOT_HTTPS"], [4, "WILDCARD"], [5, "HAS_PATH"], [6, "MALFORMED"], [7, "DUPLICATE"]]);
    assert.deepEqual(originProblems(["https://ok.example.com"]), []);
    const eleven = Array.from({ length: 11 }, (_, i) => `https://s${i}.example.com`);
    assert.deepEqual(originProblems(eleven).map((p) => p.problem), ["TOO_MANY"]);
    assert.deepEqual(originProblems(eleven.slice(0, 10)), []);
    assert.deepEqual(originProblems(["https://Example.COM/"]), []);
  });
  it("create form needs exactly what the scope needs", () => {
    const base = { label: "Desk", scope: "CLINIC" as const, branchRef: "", clinicianId: "", deskLabel: "", campaign: "" };
    assert.equal(createLinkError(base), null);
    assert.equal(createLinkError({ ...base, label: "x" }), "label");
    assert.equal(createLinkError({ ...base, scope: "BRANCH" }), "branchRef");
    assert.equal(createLinkError({ ...base, scope: "BRANCH", branchRef: "b1" }), null);
    assert.equal(createLinkError({ ...base, scope: "DOCTOR" }), "clinicianId");
    assert.equal(createLinkError({ ...base, scope: "DESK", deskLabel: " " }), "deskLabel");
    assert.equal(createLinkError({ ...base, campaign: "has space" }), "campaign");
    assert.equal(createLinkError({ ...base, campaign: "Ramadan-2027" }), null);
  });
  it("unknown recommendations are dropped, months are newest first, percentages localise", () => {
    assert.equal(isKnownRecommendation("UPSELL_PACKAGES"), false);
    assert.equal(isKnownRecommendation("CREATE_FIRST_LINK"), true);
    assert.deepEqual(lastMonths(3, new Date("2026-11-24T00:00:00Z")), ["2026-11", "2026-10", "2026-09"]);
    assert.equal(pct(0.1234, "en"), "12.3%");
    assert.equal(pct(null, "en"), "-");
    assert.notEqual(pct(0.5, "ar"), "50%", "Arabic digits");
  });
});
