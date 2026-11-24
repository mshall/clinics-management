import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertContentAllowed, checkContent, ContentGuardError, GUARD_TERMS, normalizeForGuard, sanitizeCustomLine } from "./content-guard";
import { PROTECTED_FOOTER, SEED_TEMPLATES, SLOT_CARD_TEXT } from "./social-templates.catalogue";

const cats = (t: string) => [...new Set(checkContent(t).map((f) => f.category))].sort();

describe("GRW-P2-C content guard", () => {
  it("blocks guarantee, cure, comparison, testimonial, before-and-after, pressure and over-treatment wording in English", () => {
    assert.deepEqual(cats("We guarantee results"), ["GUARANTEE"]);
    assert.deepEqual(cats("A permanent cure for back pain"), ["CURE"]);
    assert.deepEqual(cats("The cheapest clinic in town"), ["COMPARISON"]);
    assert.ok(cats("Read what our patients say").includes("TESTIMONIAL"));
    assert.deepEqual(cats("Before and after photos"), ["BEFORE_AFTER"]);
    assert.ok(cats("Hurry, limited time only").includes("PRESSURE"));
    assert.ok(cats("Buy a package of unlimited sessions").includes("OVERTREATMENT"));
    assert.ok(cats("Best doctor in Cairo, number one").includes("SUPERLATIVE"));
    assert.ok(cats("100% safe").includes("GUARANTEE"));
  });
  it("blocks the same in Arabic, including diacritics, tatweel and Arabic-Indic digits", () => {
    assert.ok(cats("نضمن لك الشفاء").includes("GUARANTEE"));
    assert.ok(cats("شفاء تام").includes("CURE"));
    assert.ok(cats("أرخص سعر في القاهرة").includes("COMPARISON"));
    assert.ok(cats("قبل وبعد").includes("BEFORE_AFTER"));
    assert.ok(cats("ضَـمَـان النتيجة").includes("GUARANTEE"));
    assert.ok(cats("نتيجة ١٠٠٪ مضمونة").includes("GUARANTEE"));
    assert.ok(cats("لا تفوّت الفرصة").includes("PRESSURE"));
    assert.ok(cats("اليوم فقط").includes("PRESSURE"));
  });
  it("matches whole words only (secure and procure are not cure)", () => {
    assert.deepEqual(checkContent("Secure online booking and procurement"), []);
    assert.deepEqual(checkContent("Book your visit and see available times"), []);
  });
  it("normalisation is stable and strips zero-width characters", () => {
    assert.equal(normalizeForGuard("  GUAR​ANTEE "), "guarantee");
    assert.equal(normalizeForGuard("إأآ"), "ااا");
  });
  it("assertContentAllowed throws a ContentGuardError that lists categories", () => {
    assert.throws(() => assertContentAllowed("miracle cure"), (e) => e instanceof ContentGuardError && e.findings.length >= 1);
    assert.doesNotThrow(() => assertContentAllowed("See available times"));
  });
  it("sanitizeCustomLine strips markup, URLs and control characters and caps the length", () => {
    assert.equal(sanitizeCustomLine("<b>Hello</b> https://evil.example/x www.evil.example now"), "b Hello /b now");
    assert.equal(sanitizeCustomLine("x".repeat(500)).length, 140);
    assert.equal(sanitizeCustomLine(null), "");
  });
  it("the deny list is closed: every term has an id, a category and at least one phrase or pattern", () => {
    for (const t of GUARD_TERMS) assert.ok(t.id && t.category && ((t.en?.length ?? 0) + (t.ar?.length ?? 0) > 0 || t.pattern), t.id);
  });
  it("every seeded template, slot-card text and the protected footer passes the guard in both languages", () => {
    for (const t of SEED_TEMPLATES) {
      for (const l of ["en", "ar"] as const) assert.deepEqual(checkContent(`${t[l].title} ${t[l].body}`), [], `${t.slug}/${l}`);
    }
    for (const l of ["en", "ar"] as const) {
      assert.deepEqual(checkContent(`${SLOT_CARD_TEXT[l].title} ${SLOT_CARD_TEXT[l].intro} ${SLOT_CARD_TEXT[l].cta}`), [], `slot/${l}`);
      assert.deepEqual(checkContent(PROTECTED_FOOTER[l]), [], `footer/${l}`);
    }
  });
});
