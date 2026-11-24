/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { growthAr, growthEn } from "./growth-strings";
import { RECOMMENDATION_IDS } from "./growth-logic";
import { pmAr, pmEn } from "./provider-marketing-strings";
import { errorCodeOf, needsEvidence, parseEvidence, recentMonths, refusedCategories, slotLabelFor, smsUrl, whatsappUrl } from "./provider-marketing-logic";

const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const get = (o: any, path: string): string => path.split(".").reduce((x: any, p) => x[p], o);

describe("GRW-P2-C wording", () => {
  it("English and Arabic have identical keys, no empty values and the same placeholders", () => {
    assert.deepEqual(flat(pmEn).sort(), flat(pmAr).sort());
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const k of flat(pmEn)) {
      assert.ok(get(pmEn, k).length > 0 && get(pmAr, k).length > 0, k);
      assert.equal(ph(get(pmEn, k)), ph(get(pmAr, k)), k);
    }
  });
  it("Arabic wording is Arabic: Latin appears only in file-format tokens", () => {
    const allowed = new Set(["csv", "pdf", "sms"]);
    for (const k of flat(pmAr)) for (const w of get(pmAr, k).replace(/\{\{\w+\}\}/g, "").match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) assert.ok(allowed.has(w.toLowerCase()), `${k}: ${w}`);
  });
  it("the 21-id recommendation catalogue has wording in both languages for exactly its ids", () => {
    assert.equal(RECOMMENDATION_IDS.length, 21);
    assert.deepEqual(Object.keys(growthEn.rec.items).sort(), [...RECOMMENDATION_IDS].sort());
    assert.deepEqual(Object.keys(growthAr.rec.items).sort(), [...RECOMMENDATION_IDS].sort());
  });
  it("guardrail: no recommendation or share wording promises results, pushes treatment, price pressure, review buying or testimonials", () => {
    const badEn = /guarantee|cure|miracle|cheapest|lowest price|best doctor|number one|testimonial|before and after|hurry|limited time|upsell|more procedures|extra procedure|add procedures? to|raise (your )?prices?|buy reviews|incentivi[sz]e|fake review|more patients|grow your|boost|increase your (revenue|income|bookings)/i;
    const badAr = /ضمان|نضمن|شفاء|معجزة|الأرخص|أرخص|أقل سعر|أفضل (دكتور|طبيب)|رقم واحد|شهادات|قبل وبعد|الحق|فرصة أخيرة|إجراءات إضافية|علاجات إضافية|رفع الأسعار|شراء تقييمات|تقييمات مزيفة|مرضى أكثر|زيادة (إيراداتك|دخلك|حجوزاتك)/;
    const explainers = new Set(["share.customHint", "share.refused", "share.refusedWhat.GUARANTEE", "share.refusedWhat.CURE", "share.refusedWhat.COMPARISON", "share.refusedWhat.SUPERLATIVE", "share.refusedWhat.TESTIMONIAL", "share.refusedWhat.BEFORE_AFTER", "share.refusedWhat.PRESSURE", "share.refusedWhat.OVERTREATMENT"]);
    for (const k of flat(pmEn)) if (!explainers.has(k)) assert.doesNotMatch(get(pmEn, k), badEn, k);
    for (const k of flat(pmAr)) if (!explainers.has(k)) assert.doesNotMatch(get(pmAr, k), badAr, k);
    for (const id of RECOMMENDATION_IDS) {
      assert.doesNotMatch(growthEn.rec.items[id], badEn, id);
      assert.doesNotMatch(growthAr.rec.items[id], badAr, id);
    }
  });
  it("the review reply recommendation forbids medical details and no wording asks for reviews", () => {
    assert.match(growthEn.rec.items.RESPOND_TO_REVIEW, /never mention medical details/);
    for (const k of flat(pmEn)) assert.doesNotMatch(get(pmEn, k), /ask (your )?patients? (for|to leave) (a )?review|request a review/i, k);
  });
  it("every rule that shows a data window has a plain-language label for it", () => {
    for (const w of ["now", "30d", "next 7 days", "3d"]) assert.ok(pmEn.rec.windows[w as keyof typeof pmEn.rec.windows], w);
  });
  it("the statement says what a fee is and never that evidence can add one", () => {
    assert.match(pmEn.statements.hint, /decision log and the charge ledger/);
    assert.match(pmEn.verification.hint, /current verified details stay as they are/);
  });
});

describe("GRW-P2-C logic", () => {
  it("parseEvidence trims, de-duplicates, rejects odd references and caps at 10", () => {
    assert.deepEqual(parseEvidence(" a/b.pdf \n\nx_1\na/b.pdf"), { refs: ["a/b.pdf", "x_1"], invalid: [] });
    assert.deepEqual(parseEvidence("../x\nok-1").invalid, ["../x"]);
    assert.deepEqual(parseEvidence("javascript:alert(1)").invalid, ["javascript:alert(1)"]);
    const r = parseEvidence(Array.from({ length: 12 }, (_, i) => `f${i}`).join("\n"));
    assert.equal(r.refs.length, 10);
    assert.equal(r.invalid.length, 2);
  });
  it("photo and document changes need evidence", () => {
    assert.ok(needsEvidence("PHOTO") && needsEvidence("DOCUMENT"));
    assert.ok(!needsEvidence("LICENSE_NUMBER") && !needsEvidence("ADDRESS"));
  });
  it("share links never carry a recipient", () => {
    assert.equal(whatsappUrl("hi there"), "https://wa.me/?text=hi%20there");
    assert.ok(smsUrl("a b").startsWith("sms:?&body="));
    assert.ok(!/wa\.me\/\d/.test(whatsappUrl("x")));
  });
  it("months are newest first and cross year ends", () => {
    assert.deepEqual(recentMonths(3, new Date("2027-01-15T00:00:00Z")), ["2027-01", "2026-12", "2026-11"]);
  });
  it("labels follow the UI language; error bodies are read safely", () => {
    const s = { labelEn: "Tue 24 Nov, 10:00", labelAr: "الثلاثاء 24 نوفمبر، 10:00 ص" };
    assert.equal(slotLabelFor(s, "ar-EG"), s.labelAr);
    assert.equal(slotLabelFor(s, "en"), s.labelEn);
    assert.deepEqual(refusedCategories({ findings: [{ category: "CURE" }, { category: "GUARANTEE" }, { category: "CURE" }, {}] }), ["CURE", "GUARANTEE"]);
    assert.deepEqual(refusedCategories(null), []);
    assert.equal(errorCodeOf({ body: { code: "SLOT_NO_LONGER_AVAILABLE" } }), "SLOT_NO_LONGER_AVAILABLE");
    assert.equal(errorCodeOf(null), null);
  });
});
