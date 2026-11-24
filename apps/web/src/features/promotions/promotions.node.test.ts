/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promotionsAr, promotionsEn } from "./promotions-strings";
import { budgetUsedPct, buildBody, canArchive, canEdit, canPause, canResume, canSubmit, emptyForm, guardTerms, minorToUnits, statusTone, unitsToMinor, validateForm, type PromotionForm } from "./promotions-logic";

const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const get = (o: any, path: string): string => path.split(".").reduce((x: any, p) => x[p], o);
const ok = (o: Partial<PromotionForm> = {}): PromotionForm => ({ ...emptyForm(), nameAr: "خصم", nameEn: "Discount", patientCopyAr: "خصم على الكشف", patientCopyEn: "A discount on the visit fee", discountValue: "100", budget: "1000", startsAt: "2027-02-01T09:00", endsAt: "2027-03-01T09:00", ...o });

describe("Promotion wording (AR and EN)", () => {
  it("identical keys, no empty values, same placeholders", () => {
    assert.deepEqual(flat(promotionsEn).sort(), flat(promotionsAr).sort());
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const k of flat(promotionsEn)) { const e = get(promotionsEn, k); const a = get(promotionsAr, k); assert.ok(e.length > 0 && a.length > 0, k); assert.equal(ph(e), ph(a), k); }
  });
  it("Arabic has no Latin words", () => { for (const k of flat(promotionsAr)) assert.deepEqual(get(promotionsAr, k).replace(/\{\{\w+\}\}/g, "").match(/[A-Za-z][A-Za-z0-9]*/g) ?? [], [], k); });
  it("every status the server can return has a label", () => { for (const s of ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE", "PAUSED", "EXHAUSTED", "EXPIRED", "REJECTED", "ARCHIVED"]) assert.ok(get(promotionsEn, `status.${s}`), s); for (const t of ["RESERVE", "RELEASE", "DEBIT", "REVERSE_DEBIT"]) assert.ok(get(promotionsEn, `entryType.${t}`), t); });
  it("never promises money or cash and never says the discount is Kiorex's", () => {
    for (const k of flat(promotionsEn)) assert.ok(!/withdraw(?!n)|cash ?out|kiorex discount|from kiorex/i.test(get(promotionsEn, k).replace(/cannot be withdrawn/, "")), k);
    assert.match(promotionsEn.intro, /sponsored by your clinic/); assert.match(promotionsEn.walletNote, /not cash/);
  });
});

describe("Promotion form", () => {
  it("a complete form is valid and builds a minor-unit body (a percentage in basis points)", () => {
    assert.deepEqual(validateForm(ok()), []);
    const b = buildBody(ok()); assert.deepEqual(b.discount, { kind: "FIXED_MINOR", value: 10_000 }); assert.equal(b.budgetCapMinor, 100_000); assert.deepEqual(b.scope, { doctorIds: [], appointmentTypeIds: [], careTypes: ["IN_CLINIC"] });
    const p = buildBody(ok({ discountKind: "PERCENT_BP", discountValue: "20", maxPerBooking: "75.5" })); assert.deepEqual(p.discount, { kind: "PERCENT_BP", value: 2000, maxPerBookingMinor: 7550 });
    assert.deepEqual(b.eligibility, { newPatientsOnly: false, firstBookingOnly: false, minLeadHours: 0, kiorexOnly: true });
  });
  it("the rules mirror the server", () => {
    assert.ok(validateForm(ok({ nameAr: "" })).includes("names")); assert.ok(validateForm(ok({ patientCopyEn: " " })).includes("copy")); assert.ok(validateForm(ok({ careTypes: [] })).includes("careType"));
    assert.ok(validateForm(ok({ discountValue: "0" })).includes("discount")); assert.ok(validateForm(ok({ discountKind: "PERCENT_BP", discountValue: "120", maxPerBooking: "10" })).includes("discount"));
    assert.ok(validateForm(ok({ discountKind: "PERCENT_BP", discountValue: "20", maxPerBooking: "" })).includes("percentMax"));
    assert.ok(validateForm(ok({ budget: "" })).includes("budget")); assert.ok(validateForm(ok({ budget: "50" })).includes("budgetBelowDiscount"));
    assert.ok(validateForm(ok({ endsAt: "2027-01-01T09:00" })).includes("window")); assert.ok(validateForm(ok({ perPatientLimit: "0" })).includes("limit")); assert.ok(validateForm(ok({ perDayLimit: "x" })).includes("limit"));
  });
  it("money conversion and budget share", () => {
    assert.equal(minorToUnits(12_345), 123.45); assert.equal(unitsToMinor(123.45), 12_345); assert.equal(unitsToMinor(0.1 + 0.2), 30);
    assert.equal(budgetUsedPct({ capMinor: 1000, exposureMinor: 250 }), 25); assert.equal(budgetUsedPct({ capMinor: 1000, exposureMinor: 5000 }), 100); assert.equal(budgetUsedPct({ capMinor: 0, exposureMinor: 0 }), 0);
  });
  it("what the owner can do in each state, and the tone of each state", () => {
    assert.deepEqual([canSubmit("DRAFT"), canSubmit("REJECTED"), canSubmit("ACTIVE"), canSubmit("IN_REVIEW")], [true, true, false, false]);
    assert.deepEqual([canPause("ACTIVE"), canPause("EXHAUSTED"), canPause("PAUSED"), canResume("PAUSED"), canResume("ACTIVE")], [true, true, false, true, false]);
    assert.deepEqual([canEdit("IN_REVIEW"), canEdit("EXPIRED"), canEdit("ARCHIVED"), canEdit("ACTIVE")], [false, false, false, true]);
    assert.deepEqual([canArchive("EXPIRED"), canArchive("ACTIVE"), canArchive("IN_REVIEW")], [true, false, false]);
    assert.deepEqual([statusTone("ACTIVE"), statusTone("IN_REVIEW"), statusTone("PAUSED"), statusTone("REJECTED"), statusTone("EXPIRED")], ["good", "info", "warn", "bad", "neutral"]);
  });
  it("shows the blocked terms of a 422 and nothing for warnings", () => {
    assert.deepEqual(guardTerms({ hits: [{ term: "surgery", severity: "BLOCK" }, { term: "free", severity: "WARN" }, { term: "surgery", severity: "BLOCK" }] }), ["surgery"]); assert.deepEqual(guardTerms(null), []);
  });
});
