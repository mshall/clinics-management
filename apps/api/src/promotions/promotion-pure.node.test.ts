import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetInvariantViolations, budgetState, burnRatio, canReserve, type BudgetEntryLike } from "./promotion-budget-math";
import { guardTexts, normalise } from "./promotion-content-guard";
import { checkBooking, checkLimits, checkReservable, discountMinor, parseEligibility, parseScope, type PromotionScope } from "./promotion-eligibility";
import { clinicalInducement, collusionLoop, farm, holds, noAttendance, priceInflation, selfDeal, velocity } from "./promotion-fraud.rules";
import { PROPOSED_DEFAULT_POLICY, resolvePolicy } from "./promotion-policy";
import { contentHashOf, highValueReasons, reviewKindsFor, reviewOutcome, validateVersion, type VersionInput } from "./promotion-version";

const E = (type: BudgetEntryLike["type"], amountMinor: number): BudgetEntryLike => ({ type, amountMinor });
const NOW = new Date("2027-01-10T10:00:00Z");
const base = (o: Partial<VersionInput> = {}): VersionInput => ({
  nameAr: "خصم الزيارة الأولى", nameEn: "First visit discount", patientCopyAr: "خصم على سعر الكشف برعاية العيادة", patientCopyEn: "A discount on the visit fee, sponsored by the clinic",
  scope: { doctorIds: ["dr1"], appointmentTypeIds: [], careTypes: ["IN_CLINIC"] }, discount: { kind: "FIXED_MINOR", value: 10_000 }, budgetCapMinor: 100_000, perPatientLimit: 1,
  eligibility: { newPatientsOnly: true, firstBookingOnly: false, minLeadHours: 2, kiorexOnly: true }, startsAt: new Date("2027-01-11T00:00:00Z"), endsAt: new Date("2027-02-11T00:00:00Z"), fundingMode: "WALLET_ONLY", ...o,
});

describe("budget math", () => {
  it("exposure is reserved + debited - released - reversed, remaining is cap minus exposure", () => {
    const s = budgetState([E("RESERVE", 100), E("RESERVE", 100), E("RELEASE", 100), E("DEBIT", 50), E("REVERSE_DEBIT", 20)], 1000);
    assert.deepEqual([s.reservedMinor, s.releasedMinor, s.debitedMinor, s.reversedMinor, s.exposureMinor, s.remainingMinor, s.heldMinor, s.netDebitedMinor], [200, 100, 50, 20, 130, 870, 100, 30]);
  });
  it("a reservation converted to a debit (RELEASE + DEBIT) keeps the exposure unchanged; a reversal frees it", () => {
    const held = [E("RESERVE", 100)]; assert.equal(budgetState(held, 500).exposureMinor, 100);
    const done = [...held, E("RELEASE", 100), E("DEBIT", 100)]; assert.equal(budgetState(done, 500).exposureMinor, 100);
    assert.equal(budgetState([...done, E("REVERSE_DEBIT", 100)], 500).exposureMinor, 0);
  });
  it("cap never exceeded under 5,000 random legal sequences; release and reversal restore the budget", () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 50; run++) {
      const cap = 1000 + Math.floor(rnd() * 5000); const entries: BudgetEntryLike[] = []; const open: number[] = []; const debited: number[] = [];
      for (let i = 0; i < 100; i++) {
        const r = rnd();
        if (r < 0.45) { const a = 1 + Math.floor(rnd() * 400); if (canReserve(entries, cap, a)) { entries.push(E("RESERVE", a)); open.push(a); } }
        else if (r < 0.65 && open.length) { const a = open.splice(Math.floor(rnd() * open.length), 1)[0]!; entries.push(E("RELEASE", a)); }
        else if (r < 0.85 && open.length) { const a = open.splice(Math.floor(rnd() * open.length), 1)[0]!; entries.push(E("RELEASE", a), E("DEBIT", a)); debited.push(a); }
        else if (debited.length) { const a = debited.splice(Math.floor(rnd() * debited.length), 1)[0]!; entries.push(E("REVERSE_DEBIT", a)); }
        assert.deepEqual(budgetInvariantViolations(entries, cap), []);
      }
    }
  });
  it("reports a violation when a release or reversal has no base", () => {
    assert.ok(budgetInvariantViolations([E("RELEASE", 10)], 100).includes("RELEASED_MORE_THAN_RESERVED"));
    assert.ok(budgetInvariantViolations([E("RESERVE", 10), E("REVERSE_DEBIT", 10)], 100).includes("REVERSED_MORE_THAN_DEBITED"));
    assert.ok(budgetInvariantViolations([E("RESERVE", 101)], 100).includes("EXPOSURE_ABOVE_CAP"));
    assert.throws(() => budgetState([E("RESERVE", 0)], 10), RangeError);
  });
  it("burn ratio compares recent spend with an even plan", () => { assert.equal(burnRatio(1000, 24, 10_000, 240), 1000 / 24 / (10_000 / 240)); assert.equal(burnRatio(5, 0, 1, 1), 0); });
});

describe("eligibility", () => {
  const scope: PromotionScope = { doctorIds: ["dr1"], appointmentTypeIds: ["t1"], careTypes: ["IN_CLINIC", "VIDEO"] };
  const v = { status: "ACTIVE", startsAt: new Date("2027-01-01T00:00:00Z"), endsAt: new Date("2027-02-01T00:00:00Z"), scope, eligibility: { newPatientsOnly: true, firstBookingOnly: true, minLeadHours: 4, kiorexOnly: true }, perPatientLimit: 1, perDayLimit: 3 };
  it("reservable: status, window and care type", () => {
    assert.deepEqual(checkReservable(v, "IN_CLINIC", NOW), { ok: true });
    assert.deepEqual(checkReservable({ ...v, status: "PAUSED" }, "IN_CLINIC", NOW), { ok: false, reason: "PAUSED", detail: "PAUSED" });
    assert.equal((checkReservable({ ...v, status: "EXHAUSTED" }, "IN_CLINIC", NOW) as { reason: string }).reason, "BUDGET_EXHAUSTED");
    assert.equal((checkReservable({ ...v, status: "APPROVED" }, "IN_CLINIC", NOW) as { reason: string }).reason, "NOT_ELIGIBLE");
    assert.equal((checkReservable(v, "IN_CLINIC", new Date("2027-02-01T00:00:00Z")) as { detail: string }).detail, "OUTSIDE_WINDOW");
    assert.equal((checkReservable(v, "HOME_VISIT", NOW) as { detail: string }).detail, "CARE_TYPE_NOT_IN_SCOPE");
  });
  it("limits", () => {
    assert.deepEqual(checkLimits(v, { patientUses: 0, dayUses: 2 }), { ok: true });
    assert.equal((checkLimits(v, { patientUses: 1, dayUses: 0 }) as { detail: string }).detail, "PER_PATIENT");
    assert.equal((checkLimits(v, { patientUses: 0, dayUses: 3 }) as { detail: string }).detail, "PER_DAY");
  });
  const bk = (o = {}) => ({ doctorId: "dr1", appointmentTypeId: "t1", careType: "IN_CLINIC", startsAt: new Date(NOW.getTime() + 6 * 3_600_000), isNewToClinic: true, kiorexBookingsBefore: 0, channelIsKiorex: true, visitFeeMinor: 50_000, ...o });
  it("booking-time rules (vectors)", () => {
    assert.deepEqual(checkBooking(v, bk(), NOW), { ok: true });
    for (const [o, d] of [[{ doctorId: "dr9" }, "DOCTOR_NOT_IN_SCOPE"], [{ appointmentTypeId: "t9" }, "TYPE_NOT_IN_SCOPE"], [{ careType: "HOME_VISIT" }, "CARE_TYPE_NOT_IN_SCOPE"], [{ channelIsKiorex: false }, "NOT_A_KIOREX_BOOKING"], [{ isNewToClinic: false }, "NOT_NEW_TO_CLINIC"], [{ kiorexBookingsBefore: 1 }, "NOT_FIRST_KIOREX_BOOKING"], [{ startsAt: new Date(NOW.getTime() + 3_600_000) }, "LEAD_TIME_TOO_SHORT"], [{ visitFeeMinor: 0 }, "NO_VISIT_FEE"]] as const)
      assert.equal((checkBooking(v, bk(o), NOW) as { detail: string }).detail, d);
    assert.deepEqual(checkBooking({ ...v, scope: { ...scope, doctorIds: [], appointmentTypeIds: [] } }, bk({ doctorId: "any", appointmentTypeId: "any" }), NOW), { ok: true }); // empty lists mean all of this clinic
  });
  it("discount arithmetic: visit fee only, capped by max per booking and by the fee", () => {
    assert.equal(discountMinor({ kind: "FIXED_MINOR", value: 10_000 }, 50_000), 10_000);
    assert.equal(discountMinor({ kind: "FIXED_MINOR", value: 90_000 }, 50_000), 50_000);
    assert.equal(discountMinor({ kind: "PERCENT_BP", value: 2000, maxPerBookingMinor: 5000 }, 50_000), 5000);
    assert.equal(discountMinor({ kind: "PERCENT_BP", value: 2000 }, 50_001), 10_000);
    assert.equal(discountMinor({ kind: "PERCENT_BP", value: 10_000 }, 333), 333);
    assert.equal(discountMinor({ kind: "FIXED_MINOR", value: 100 }, 0), 0);
  });
  it("scope and eligibility accept only non-clinical keys", () => {
    for (const bad of [{ diagnosis: ["x"] }, { drugs: [] }, { specialty: ["cardio"] }, { condition: "x" }, { tests: [] }]) {
      assert.equal(parseScope({ doctorIds: [], appointmentTypeIds: [], careTypes: ["IN_CLINIC"], ...bad }).ok, false);
      assert.equal(parseEligibility({ ...bad }).ok, false);
    }
    assert.equal(parseScope({ careTypes: [] }).ok, false); assert.equal(parseScope({ careTypes: ["TELEPORT"] }).ok, false);
    assert.deepEqual(parseEligibility({}), { ok: true, eligibility: { newPatientsOnly: false, firstBookingOnly: false, minLeadHours: 0, kiorexOnly: true } });
  });
});

describe("content guard corpus (AR and EN)", () => {
  const T = (nameEn: string, patientCopyEn = "A discount on the visit fee", nameAr = "خصم الزيارة", patientCopyAr = "خصم على سعر الكشف") => guardTexts({ nameEn, patientCopyEn, nameAr, patientCopyAr });
  it("passes plain visit-fee wording in both languages (including the Arabic word for first)", () => { assert.equal(T("First visit discount", "A discount on the visit fee", "خصم الزيارة الأولى", "خصم على سعر الكشف برعاية العيادة").ok, true); const r = T("First visit discount"); assert.equal(r.ok, true); assert.deepEqual(r.hits, []); assert.equal(r.signal, null); });
  const blockedEn = ["Free treatment for new patients", "Diabetes check discount", "Discount on surgery consultation package", "We cure back pain", "Best doctor in Cairo", "100% guaranteed results", "Laser hair removal offer", "X-ray included", "Pregnancy follow-up offer", "Painless injection visit", "MRI scan deal", "Weight loss visit", "Miracle visit"];
  for (const t of blockedEn) it(`blocks EN: ${t}`, () => assert.equal(T(t).ok, false, t));
  const blockedAr = ["علاج مجاني للمرضى الجدد", "عرض على تحاليل الدم", "خصم على عمليه جراحيه", "نتيجه مضمونه ١٠٠٪", "افضل دكتور في القاهره", "كشف سكر وضغط", "أشعة ورنين بخصم", "ليزر وبوتوكس", "متابعة حمل بخصم", "علاج الم الظهر"];
  for (const t of blockedAr) it(`blocks AR: ${t}`, () => assert.equal(guardTexts({ nameEn: "Visit discount", patientCopyEn: "Visit fee discount", nameAr: t, patientCopyAr: "خصم على الكشف" }).ok, false, t));
  it("normalises Arabic spelling variants, diacritics and tatweel", () => {
    assert.equal(normalise("عِــلاج"), normalise("علاج")); assert.equal(normalise("أشعة"), normalise("اشعه")); assert.equal(normalise("٢٠٢٧"), "2027");
    assert.equal(guardTexts({ nameEn: "Visit", patientCopyEn: "Visit fee discount", nameAr: "عِــلاج", patientCopyAr: "خصم" }).ok, false);
  });
  it("free alone is a warning for the human reviewer, free next to clinical wording blocks, and the inducement signal is raised for clinical hits", () => {
    const w = T("Free booking fee"); assert.equal(w.ok, true); assert.ok(w.hits.some((h) => h.rule === "WARN_FREE"));
    const b = T("Free surgery"); assert.equal(b.ok, false); assert.ok(b.hits.some((h) => h.rule === "FREE_TREATMENT")); assert.equal(b.signal, "PF_CLINICAL_INDUCEMENT");
    assert.equal(T("Hurry, last chance").ok, true);
  });
  it("short terms do not match inside other words", () => { assert.equal(T("Primrose clinic offer").ok, true); assert.equal(guardTexts({ nameEn: "Visit", patientCopyEn: "Fee", nameAr: "خصم السكرتارية", patientCopyAr: "خصم" }).ok, true); });
});

describe("version validation, hash, review", () => {
  const P = PROPOSED_DEFAULT_POLICY;
  it("a valid version passes and is hashed deterministically; any money or text change changes the hash", () => {
    const a = validateVersion(base(), P, NOW); assert.equal(a.ok, true); if (!a.ok) return;
    const h = contentHashOf(a.version); assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(contentHashOf((validateVersion(base({ scope: { careTypes: ["IN_CLINIC"], doctorIds: ["dr1"], appointmentTypeIds: [] } }), P, NOW) as unknown as { version: Parameters<typeof contentHashOf>[0] }).version), h);
    for (const o of [{ budgetCapMinor: 100_001 }, { nameEn: "Other" }, { perPatientLimit: 2 }, { fundingMode: "WALLET_THEN_INVOICE" as const }]) { const v = validateVersion(base(o), P, NOW); assert.equal(v.ok && contentHashOf(v.version) === h, false, JSON.stringify(o)); }
  });
  it("refuses bad input with specific codes", () => {
    const code = (o: Partial<VersionInput>) => (validateVersion(base(o), P, NOW) as { errors: string[] }).errors;
    assert.ok(code({ nameAr: "" }).includes("TEXT_BOTH_LANGUAGES_REQUIRED")); assert.ok(code({ budgetCapMinor: 0 }).includes("BUDGET_INVALID"));
    assert.ok(code({ discount: { kind: "PERCENT_BP", value: 2000 } }).includes("PERCENT_NEEDS_MAX_PER_BOOKING")); assert.ok(code({ discount: { kind: "PERCENT_BP", value: 20_000, maxPerBookingMinor: 5 } }).includes("DISCOUNT_PERCENT_OVER_100"));
    assert.ok(code({ discount: { kind: "FIXED_MINOR", value: 200_000 } }).includes("DISCOUNT_ABOVE_BUDGET")); assert.ok(code({ endsAt: new Date("2027-01-05T00:00:00Z") }).includes("WINDOW_INVALID") || code({ endsAt: new Date("2027-01-05T00:00:00Z") }).includes("WINDOW_IN_THE_PAST"));
    assert.ok(code({ endsAt: new Date("2029-01-01T00:00:00Z") }).includes("WINDOW_TOO_LONG")); assert.ok(code({ scope: { doctorIds: [], appointmentTypeIds: [], careTypes: ["IN_CLINIC"], diagnosis: ["x"] } }).some((e) => e.startsWith("SCOPE_KEY_NOT_ALLOWED")));
    assert.ok(code({ perPatientLimit: 0 }).includes("PER_PATIENT_LIMIT_INVALID"));
    const narrow = { ...P, allowedCareTypes: ["IN_CLINIC" as const] }; assert.ok((validateVersion(base({ scope: { doctorIds: [], appointmentTypeIds: [], careTypes: ["HOME_VISIT"] } }), narrow, NOW) as { errors: string[] }).errors.includes("CARE_TYPE_NOT_ALLOWED:HOME_VISIT"));
  });
  it("high value thresholds decide the second approver", () => {
    const v = (cap: number, d: VersionInput["discount"]) => ({ budgetCapMinor: cap, discount: d });
    assert.deepEqual(highValueReasons(v(100_000, { kind: "FIXED_MINOR", value: 10_000 }), P), []);
    assert.deepEqual(highValueReasons(v(5_000_000, { kind: "FIXED_MINOR", value: 10_000 }), P), ["BUDGET_AT_OR_ABOVE_THRESHOLD"]);
    assert.deepEqual(highValueReasons(v(100_000, { kind: "FIXED_MINOR", value: 50_000 }), P), ["PER_BOOKING_AT_OR_ABOVE_THRESHOLD"]);
    assert.ok(highValueReasons(v(100_000, { kind: "PERCENT_BP", value: 3500, maxPerBookingMinor: 1000 }), P).includes("PERCENT_ABOVE_MAXIMUM"));
    assert.deepEqual(reviewKindsFor(v(100_000, { kind: "FIXED_MINOR", value: 10_000 }), P), ["CONTENT", "SCOPE"]); assert.deepEqual(reviewKindsFor(v(9_000_000, { kind: "FIXED_MINOR", value: 10_000 }), P), ["CONTENT", "SCOPE", "HIGH_VALUE"]);
  });
  it("review outcome: all required approved by people who are not the author; the high-value approver is a different person", () => {
    const r = (kind: string, decidedBy: string | null, decision: string | null, requestedBy = "clinic_u1") => ({ kind, requestedBy, decidedBy, decision });
    assert.equal(reviewOutcome(["CONTENT", "SCOPE"], [r("CONTENT", "kx_a", "APPROVED"), r("SCOPE", "kx_a", "APPROVED")]), "APPROVED");
    assert.equal(reviewOutcome(["CONTENT", "SCOPE"], [r("CONTENT", "kx_a", "APPROVED"), r("SCOPE", null, null)]), "PENDING");
    assert.equal(reviewOutcome(["CONTENT", "SCOPE"], [r("CONTENT", "kx_a", "REJECTED"), r("SCOPE", null, null)]), "REJECTED");
    assert.equal(reviewOutcome(["CONTENT"], [r("CONTENT", "kx_a", "NEEDS_CHANGES")]), "NEEDS_CHANGES");
    assert.equal(reviewOutcome(["CONTENT"], [r("CONTENT", "clinic_u1", "APPROVED")]), "INVALID");
    assert.equal(reviewOutcome(["CONTENT", "SCOPE", "HIGH_VALUE"], [r("CONTENT", "kx_a", "APPROVED"), r("SCOPE", "kx_a", "APPROVED"), r("HIGH_VALUE", "kx_a", "APPROVED")]), "INVALID"); // same person twice
    assert.equal(reviewOutcome(["CONTENT", "SCOPE", "HIGH_VALUE"], [r("CONTENT", "kx_a", "APPROVED"), r("SCOPE", "kx_a", "APPROVED"), r("HIGH_VALUE", "kx_b", "APPROVED")]), "APPROVED");
  });
  it("policy: defaults, validation, and the review can never be switched off", () => {
    assert.deepEqual(resolvePolicy(null), P); const p = resolvePolicy({ sponsoredPromotions: { reviewRequired: false, maxDiscountBp: 99_999, highValueBudgetMinor: 123, commissionBasis: "NET_AFTER_SPONSORED", allowedCareTypes: ["VIDEO", "X"] } });
    assert.equal(p.reviewRequired, true); assert.equal(p.maxDiscountBp, P.maxDiscountBp); assert.equal(p.highValueBudgetMinor, 123); assert.equal(p.commissionBasis, "NET_AFTER_SPONSORED"); assert.deepEqual(p.allowedCareTypes, ["VIDEO"]);
  });
});

describe("fraud rules, one scenario each", () => {
  it("PF_SELF_DEAL: patient phone equals a staff phone in any format", () => {
    assert.equal(selfDeal("01012345678", ["+201012345678"])?.rule, "PF_SELF_DEAL"); assert.equal(selfDeal("+20 101 234 5678", ["01012345678"])?.rule, "PF_SELF_DEAL");
    assert.equal(selfDeal("01099999999", ["+201012345678", null]), null); assert.equal(selfDeal(null, ["01012345678"]), null); assert.equal(selfDeal("123", ["123"]), null);
  });
  it("PF_FARM: repeated reservations by one patient", () => { assert.equal(farm({ reservationsByPatientInWindow: 3, distinctPromotions: 2 })?.rule, "PF_FARM"); assert.equal(farm({ reservationsByPatientInWindow: 2, distinctPromotions: 1 }), null); });
  it("PF_PRICE_INFLATION: fee raised more than the allowed share over the reference", () => {
    assert.equal(priceInflation({ referencePriceMinor: 50_000, currentPriceMinor: 60_000, maxPriceInWindowMinor: 60_000, bp: 500 })?.rule, "PF_PRICE_INFLATION");
    assert.equal(priceInflation({ referencePriceMinor: 50_000, currentPriceMinor: 52_000, maxPriceInWindowMinor: 52_000, bp: 500 }), null);
    assert.equal(priceInflation({ referencePriceMinor: 50_000, currentPriceMinor: 50_000, maxPriceInWindowMinor: 70_000, bp: 500 })?.rule, "PF_PRICE_INFLATION"); // raised earlier in the window, lowered before the promotion
  });
  it("PF_NO_ATTENDANCE: a debit needs a check-in and COMPLETED (or CHECKED_IN for 24 h)", () => {
    assert.equal(noAttendance({ checkedInAt: null, status: "COMPLETED", hoursSinceCheckIn: null })?.detail, "NO_CHECK_IN");
    assert.equal(noAttendance({ checkedInAt: new Date(), status: "CONFIRMED", hoursSinceCheckIn: 30 })?.rule, "PF_NO_ATTENDANCE");
    assert.equal(noAttendance({ checkedInAt: new Date(), status: "COMPLETED", hoursSinceCheckIn: 1 }), null); assert.equal(noAttendance({ checkedInAt: new Date(), status: "CHECKED_IN", hoursSinceCheckIn: 25 }), null); assert.equal(noAttendance({ checkedInAt: new Date(), status: "CHECKED_IN", hoursSinceCheckIn: 3 })?.rule, "PF_NO_ATTENDANCE");
  });
  it("PF_VELOCITY, PF_COLLUSION_LOOP, PF_CLINICAL_INDUCEMENT", () => {
    assert.equal(velocity({ burnRatio: 3.5 })?.rule, "PF_VELOCITY"); assert.equal(velocity({ burnRatio: 1.2 }), null);
    assert.equal(collusionLoop({ patientRefReuseAcrossClinics: 4, relatedOwners: true })?.rule, "PF_COLLUSION_LOOP"); assert.equal(collusionLoop({ patientRefReuseAcrossClinics: 4, relatedOwners: false }), null);
    assert.equal(clinicalInducement("PF_CLINICAL_INDUCEMENT")?.rule, "PF_CLINICAL_INDUCEMENT"); assert.equal(clinicalInducement(null), null);
  });
  it("only rules in the enforce list hold; the rest are shadow", () => { const s = farm({ reservationsByPatientInWindow: 5, distinctPromotions: 1 }); assert.equal(holds(s, PROPOSED_DEFAULT_POLICY.fraudEnforce), false); assert.equal(holds(selfDeal("01012345678", ["01012345678"]), PROPOSED_DEFAULT_POLICY.fraudEnforce), true); assert.equal(holds(null, []), false); });
});
