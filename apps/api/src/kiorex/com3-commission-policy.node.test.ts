import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DUNNING_TIMELINE, type DunningTimelineConfig } from "../subscriptions/dunning-config";
import { normalizeClaim, normalizeClaims } from "./commission-claim-view";
import { applyRateToDunning, autoChargeRetryDaysWith, disputeWindowDaysWith, invoiceDueDaysWith, loadRateParams, savedMethodChargeAllowedWith } from "./commission-rate-params";
import { commissionAmountMinor, specForTender, NO_RATE_PARAMS, parseCounselStatus, parseDisclosure, rateParamsOf, rateViewProblems, type RateSpecView } from "./commission-rate-view";
import { localStatement, normalizeStatement, periodRange, statementCsv } from "./commission-statement";
import { asTender, commissionTender, commissionTenderKind, tenderKindName, transferDetailOf } from "./commission-tender";

const base: DunningTimelineConfig = { ...DEFAULT_DUNNING_TIMELINE, reminderDaysBeforeDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysBeforeDue], reminderDaysAfterDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysAfterDue] };
const spec = (o: Partial<RateSpecView> = {}): RateSpecView => ({ feeType: "PERCENT", percentBps: 1000, flatMinor: null, minMinor: null, maxMinor: null, mode: null, ...o });

describe("COM-3 tender of a claim", () => {
  it("ONLINE when a Kiorex Pay deposit is held or applied, CASH when collected in cash, null when unknown (nothing guessed)", () => {
    assert.equal(commissionTender({ deposits: [{ method: "KIOREX_PAY", source: "KIOREX_PAY", status: "HELD" }] }), "ONLINE");
    assert.equal(commissionTender({ deposits: [{ method: "CARD", source: "PAYMENT_LINK", status: "APPLIED" }] }), "ONLINE");
    assert.equal(commissionTender({ deposits: [{ method: "KIOREX_PAY", source: "KIOREX_PAY", status: "CANCELLED" }], checkInCollectionMode: "CASH_ON_VISIT" }), "CASH");
    assert.equal(commissionTender({ checkInCollectionMode: "CASH_ON_VISIT" }), "CASH");
    assert.equal(commissionTender({ allocationMethods: ["CASH"] }), "CASH");
    assert.equal(commissionTender({ checkInCollectionMode: "MONEY_TRANSFER" }), null); // a transfer with no known channel is not guessed
    assert.equal(commissionTender({ checkInCollectionMode: "MONEY_TRANSFER", checkInTransferChannel: "FAWRY" }), null); // an unknown channel stays unknown
    assert.equal(commissionTender({}), null);
  });
  it("LG-COM-20: a direct bank / InstaPay transfer or card terminal is CASH on the wire (cash-type) and its own kind CASH_TRANSFER; unknown stays unknown", () => {
    assert.equal(commissionTender({ checkInCollectionMode: "MONEY_TRANSFER", checkInTransferChannel: "INSTAPAY" }), "CASH");
    assert.deepEqual(commissionTenderKind({ checkInCollectionMode: "MONEY_TRANSFER", checkInTransferChannel: "instapay" }), { tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: "INSTAPAY" });
    assert.deepEqual(commissionTenderKind({ checkInCollectionMode: "MONEY_TRANSFER", checkInTransferChannel: "BANK_TRANSFER" }), { tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: "BANK_TRANSFER" });
    assert.deepEqual(commissionTenderKind({ allocationMethods: ["CARD"] }), { tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: "CARD_TERMINAL" });
    assert.deepEqual(commissionTenderKind({ allocationMethods: ["TRANSFER"] }), { tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: "BANK_TRANSFER" });
    assert.deepEqual(commissionTenderKind({ checkInCollectionMode: "CASH_ON_VISIT" }), { tender: "CASH", tenderMethod: "CASH", tenderDetail: null });
    assert.deepEqual(commissionTenderKind({ deposits: [{ method: "KIOREX_PAY", source: "KIOREX_PAY", status: "HELD" }], checkInCollectionMode: "MONEY_TRANSFER", checkInTransferChannel: "INSTAPAY" }), { tender: "ONLINE", tenderMethod: null, tenderDetail: null });
    for (const f of [{}, { checkInCollectionMode: "MONEY_TRANSFER" }, { checkInCollectionMode: "MONEY_TRANSFER", checkInTransferChannel: "ORG_WALLET" }, { allocationMethods: ["WALLET", "OTHER"] }]) assert.equal(commissionTenderKind(f), null);
    assert.deepEqual([transferDetailOf("POS"), transferDetailOf("moon"), transferDetailOf(null)], ["CARD_TERMINAL", null, null]);
    assert.deepEqual([tenderKindName({ tender: "CASH", tenderMethod: "CASH_TRANSFER" }), tenderKindName({ tender: "CASH" }), tenderKindName({ tender: "ONLINE" }), tenderKindName({ tender: null })], ["CASH_TRANSFER", "CASH", "ONLINE", null]);
  });
  it("LG-COM-20: per-tender treatment: a kind with a setting is priced by it, an unset kind or an unreported tender inherits the base, an older view without tenders is unchanged", () => {
    const withT = spec({ minMinor: 500, maxMinor: 9000, tenders: { CASH_TRANSFER: { feeType: "PERCENT", percentBps: 500, minMinor: null }, ONLINE: { maxMinor: 2000 }, CASH: {} } });
    const price = (k: "ONLINE" | "CASH" | "CASH_TRANSFER" | null) => { const u = specForTender(withT, k); return [commissionAmountMinor(100000, u.spec), u.treatment]; };
    assert.deepEqual(price("CASH_TRANSFER"), [5000, "TENDER"]);
    assert.deepEqual(price("ONLINE"), [2000, "TENDER"]);
    assert.deepEqual(price("CASH"), [9000, "BASE"]); // an empty entry is not a setting
    assert.deepEqual(price(null), [9000, "BASE"]);
    const old = spec({ minMinor: 500, maxMinor: 9000 });
    for (const k of ["ONLINE", "CASH", "CASH_TRANSFER", null] as const) assert.deepEqual([commissionAmountMinor(100000, specForTender(old, k).spec), specForTender(old, k).treatment], [9000, "BASE"]);
    assert.equal(specForTender(withT, "CASH_TRANSFER").spec.tenders, undefined); // never leaks into the priced spec
    const junk = spec({ tenders: { CASH_TRANSFER: "x" as never, ONLINE: { feeType: "FLAT", flatMinor: -5 } } });
    assert.equal(specForTender(junk, "CASH_TRANSFER").treatment, "BASE");
    assert.equal(specForTender(junk, "ONLINE").spec.flatMinor, 0); // malformed amount never becomes a guessed price
  });
  it("a mixed visit counts as ONLINE; asTender is strict", () => {
    assert.equal(commissionTender({ checkInCollectionMode: "CASH_ON_VISIT", deposits: [{ method: "KIOREX_PAY", source: "CLINIC", status: "HELD" }] }), "ONLINE");
    assert.deepEqual([asTender("cash"), asTender("ONLINE"), asTender("x"), asTender(3)], ["CASH", "ONLINE", null, null]);
  });
});

describe("COM-3 run push claims are read tolerantly", () => {
  it("keeps the extra fields when valid and reads them as null when missing, malformed or unknown", () => {
    const c = normalizeClaim({ chargeId: "c1", amountMinor: 1000, disputeStatus: "OPEN", disputeDeadline: "2026-12-01T00:00:00Z", tender: "cash", rateSource: "KIOREX_DEFAULT", rateSnapshot: { version: 3 }, brandNew: { x: 1 } });
    assert.deepEqual([c?.disputeStatus, c?.disputeDeadline, c?.tender, c?.rateSource, c?.rateSnapshot], ["OPEN", "2026-12-01T00:00:00.000Z", "CASH", "KIOREX_DEFAULT", { version: 3 }]);
    assert.equal("brandNew" in (c as object), false);
    const old = normalizeClaim({ chargeId: "c2", amountMinor: 5 });
    assert.deepEqual([old?.disputeStatus, old?.disputeDeadline, old?.tender, old?.rateSource, old?.rateSnapshot], [null, null, null, null, null]);
    const bad = normalizeClaim({ chargeId: "c3", amountMinor: 5, tender: "BARTER", disputeDeadline: "not a date", rateSnapshot: [1] });
    assert.deepEqual([bad?.tender, bad?.disputeDeadline, bad?.rateSnapshot], [null, null, null]);
    // LG-COM-20: the kind rides on a CASH claim only; an older push without it is plain cash; an unknown detail is dropped
    const kind = normalizeClaim({ chargeId: "c4", amountMinor: 5, tender: "CASH", tenderMethod: "cash_transfer", tenderDetail: "instapay" });
    assert.deepEqual([kind?.tender, kind?.tenderMethod, kind?.tenderDetail], ["CASH", "CASH_TRANSFER", "INSTAPAY"]);
    const plain = normalizeClaim({ chargeId: "c5", amountMinor: 5, tender: "CASH" });
    assert.deepEqual([plain?.tenderMethod, plain?.tenderDetail], [null, null]);
    const online = normalizeClaim({ chargeId: "c6", amountMinor: 5, tender: "ONLINE", tenderMethod: "CASH_TRANSFER", tenderDetail: "INSTAPAY" });
    assert.deepEqual([online?.tenderMethod, online?.tenderDetail], [null, null]);
    assert.equal(normalizeClaim({ chargeId: "c7", amountMinor: 5, tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: "MOON" })?.tenderDetail, null);
    assert.deepEqual(normalizeClaims([null, 3, {}, { chargeId: "ok", amountMinor: 1 }]).map((x) => x.chargeId), ["ok"]);
    assert.deepEqual(normalizeClaims("nope"), []);
  });
});

describe("COM-3 rate view extras", () => {
  it("a view with the new spec fields, disclosure and counsel is accepted; so is an old one without them", () => {
    const h = [{ version: 1, scope: "DEFAULT", kind: "RATE", effectiveFrom: "2026-12-01T00:00:00Z", reason: null, spec: spec({ graceDays: 5, retryDays: [2, 5], reminderDays: [-3, 0, 2], invoiceDueDays: 10, disputeWindowDays: 14, savedMethodChargeAllowed: false, rounding: "DOWN" }) }];
    assert.deepEqual(rateViewProblems({ orgRef: "t", product: "CLINIC", version: "1", history: h, disclosure: { rateDisclosure: { en: "x" } }, counsel: { status: "APPROVED", reviewerName: "A. Counsel" }, future: true }), []);
    assert.deepEqual(rateViewProblems({ orgRef: "t", product: "CLINIC", version: "1", history: [{ ...h[0], spec: spec() }] }), []);
  });
  it("disclosure: wording set only when some language of some text is non-empty; counsel keeps the status only", () => {
    assert.equal(parseDisclosure({ rateDisclosure: { en: "", ar: "" }, termsSummary: { en: " ", ar: "" } })?.wordingSet, false);
    assert.equal(parseDisclosure({ rateDisclosure: { en: "", ar: "نص" } })?.wordingSet, true);
    assert.equal(parseDisclosure("junk"), null);
    assert.deepEqual(parseCounselStatus({ status: "APPROVED_WITH_CONDITIONS", reviewerName: "Z", documentId: "D", conditions: "C", reviewedOn: "2026-11-01" }), { status: "APPROVED_WITH_CONDITIONS", reviewedOn: "2026-11-01" });
    assert.equal(parseCounselStatus({ status: "MAYBE" }), null);
    assert.equal(parseCounselStatus(undefined), null);
  });
  it("rounding follows the rate (DOWN, UP, default half up) like the Kiorex arithmetic", () => {
    assert.deepEqual(["DOWN", "UP", undefined].map((r) => commissionAmountMinor(1005, spec({ percentBps: 1000, rounding: r as never }))), [100, 101, 101]);
    assert.equal(commissionAmountMinor(1004, spec({ percentBps: 1000 })), 100);
  });
});

describe("COM-3 rate parameters replace the Clinic constants only when present", () => {
  it("absent or malformed values read as null and every default stays", () => {
    assert.deepEqual(rateParamsOf(spec()), NO_RATE_PARAMS);
    assert.deepEqual(rateParamsOf(spec({ graceDays: 99, retryDays: [5, 5], invoiceDueDays: 0, disputeWindowDays: -1, savedMethodChargeAllowed: "yes" as never })), NO_RATE_PARAMS);
    assert.deepEqual(rateParamsOf(null), NO_RATE_PARAMS);
    assert.deepEqual(applyRateToDunning(base, NO_RATE_PARAMS), base);
    assert.equal(invoiceDueDaysWith(7, NO_RATE_PARAMS), 7);
    assert.deepEqual(autoChargeRetryDaysWith([1, 3, 7], NO_RATE_PARAMS), [1, 3, 7]);
    assert.equal(savedMethodChargeAllowedWith(NO_RATE_PARAMS), true);
    assert.equal(disputeWindowDaysWith(30, NO_RATE_PARAMS), 30);
  });
  it("platform values win when present", () => {
    const p = rateParamsOf(spec({ graceDays: 20, reminderDays: [-7, -1, 0, 3], retryDays: [2, 4], invoiceDueDays: 12, disputeWindowDays: 10, savedMethodChargeAllowed: false }));
    const t = applyRateToDunning(base, p);
    assert.deepEqual(t.reminderDaysBeforeDue, [7, 1, 0]);
    assert.deepEqual(t.reminderDaysAfterDue, [3]); // positive days after the due date are now supported
    assert.equal(t.graceEndDay, 20);
    assert.ok(t.readOnlyFromDay > t.graceEndDay && t.suspendedFromDay > t.readOnlyFromDay);
    assert.equal(invoiceDueDaysWith(7, p), 12);
    assert.deepEqual(autoChargeRetryDaysWith([1, 3, 7], p), [2, 4]);
    assert.equal(savedMethodChargeAllowedWith(p), false);
    assert.equal(disputeWindowDaysWith(30, p), 10);
  });
  it("SB-05: there is no parameter that pauses or hides the listing", () => {
    assert.equal(Object.keys(NO_RATE_PARAMS).some((k) => /pause|hide|listing/i.test(k)), false);
    assert.equal(Object.keys(applyRateToDunning(base, NO_RATE_PARAMS)).some((k) => /pause|hide|listing/i.test(k)), false);
  });
  it("loadRateParams reads the effective row of the stored view and never throws", async () => {
    const db = (view: unknown) => ({ kiorexCommissionRateView: { findUnique: async () => (view === undefined ? null : { view }) } });
    const h = [{ version: 1, scope: "DEFAULT", kind: "RATE", effectiveFrom: "2020-01-01T00:00:00Z", reason: null, spec: spec({ invoiceDueDays: 9 }) }, { version: 2, scope: "DEFAULT", kind: "RATE", effectiveFrom: "2999-01-01T00:00:00Z", reason: null, spec: spec({ invoiceDueDays: 1 }) }];
    assert.equal((await loadRateParams(db({ history: h }), "t")).invoiceDueDays, 9);
    assert.deepEqual(await loadRateParams(db(undefined), "t"), NO_RATE_PARAMS);
    assert.deepEqual(await loadRateParams(db({ history: "x" }), "t"), NO_RATE_PARAMS);
    assert.deepEqual(await loadRateParams({ kiorexCommissionRateView: { findUnique: async () => { throw new Error("db"); } } }, "t"), NO_RATE_PARAMS);
  });
});

describe("COM-3 settlement statement", () => {
  const from = new Date("2026-12-01T00:00:00Z"); const to = new Date("2027-01-01T00:00:00Z");
  it("period is YYYY-MM in UTC", () => {
    assert.equal(periodRange("2026-12")?.to.toISOString(), "2027-01-01T00:00:00.000Z");
    assert.equal(periodRange("2026-13"), null); assert.equal(periodRange("12-2026"), null);
    assert.match(periodRange(undefined)!.key, /^\d{4}-\d{2}$/);
  });
  it("normalizes the Kiorex shape, drops unknown fields, tolerates missing ones", () => {
    const raw = { orgRef: "t1", period: { from: from.toISOString(), to: to.toISOString() }, currency: "egp", payoutMethod: "BANK_TRANSFER", onlineCollectionsMinor: 10000, cashVisitCommissionAccruedMinor: 3000, cashVisitCommissionNettedMinor: 1000, cashVisitCharges: 3, deductions: { commissionMinor: 1500, feesMinor: null, refundsMinor: 0, chargebacksMinor: 0 }, commission: { totalMinor: 4500, collectedMinor: 2500, openMinor: 2000, disputedOpen: 1 }, netPayableMinor: 8500, paidByBankTransferMinor: 8500, payouts: [{ payoutRef: "po1", paidAt: "2026-12-05T00:00:00Z", cashMinor: 8500, commissionDeductedMinor: 1500, bankReference: "po1", reconciliation: "MATCHED", extra: 1 }, { nope: 1 }], reconciliation: "DISPUTED", notes: { cash: "text" }, newField: 1 };
    const v = normalizeStatement(raw, "KIOREX", { orgRef: "t1", from, to })!;
    assert.deepEqual([v.currency, v.cashVisitCommissionAccruedMinor, v.cashVisitCommissionOpenMinor, v.deductions.feesMinor, v.payouts.length, v.reconciliation, v.payouts[0]?.bankReference], ["EGP", 3000, 2000, null, 1, "DISPUTED", "po1"]);
    assert.equal("newField" in (v as object), false);
    const sparse = normalizeStatement({ onlineCollectionsMinor: 5 }, "KIOREX", { orgRef: "t1", from, to })!;
    assert.deepEqual([sparse.orgRef, sparse.netPayableMinor, sparse.payouts, sparse.reconciliation, sparse.commission.disputedOpen], ["t1", 0, [], "UNMATCHED", 0]);
    assert.equal(normalizeStatement(null, "KIOREX", { orgRef: "t1", from, to }), null);
    assert.equal(normalizeStatement("junk", "KIOREX", { orgRef: "t1", from, to }), null);
  });
  it("LG-COM-20 local mirror: cash transfer is cash-type in the totals and its own row; unknown tender is an exception count; a statement from an older Kiorex reads all cash as plain cash", () => {
    const v = localStatement({
      orgRef: "t1", from, to, currency: "EGP",
      charges: [{ amountMinor: 3000, status: "CONFIRMED", tender: "CASH", tenderMethod: "CASH" }, { amountMinor: 2000, status: "CONFIRMED", tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: "INSTAPAY" }, { amountMinor: 700, status: "CONFIRMED", tender: null }, { amountMinor: 900, status: "REVERSED", tender: null }],
      claims: [{ collectedMinor: 500, disputeStatus: null, tender: "CASH", tenderMethod: "CASH_TRANSFER" }, { collectedMinor: 100, disputeStatus: null, tender: "CASH" }],
      payouts: [],
    });
    assert.deepEqual([v.cashVisitCommissionAccruedMinor, v.cashVisitCommissionNettedMinor, v.cashVisitCharges], [5000, 600, 2]);
    assert.deepEqual([v.cashBreakdown.cash.accruedMinor, v.cashBreakdown.cash.nettedMinor, v.cashBreakdown.cashTransfer.accruedMinor, v.cashBreakdown.cashTransfer.nettedMinor, v.cashBreakdown.cashTransfer.byDetail.INSTAPAY, v.unknownTender], [3000, 100, 2000, 500, 1, { charges: 1, commissionMinor: 700 }]);
    const csv = statementCsv(v).body;
    assert.match(csv, /cashTransferAccrued,20\.00/); assert.match(csv, /cashOnlyAccrued,30\.00/); assert.match(csv, /unknownTenderCharges,1/); assert.match(csv, /cashVisitCommissionAccrued,50\.00/);
    const older = normalizeStatement({ onlineCollectionsMinor: 100, cashVisitCommissionAccruedMinor: 4000, cashVisitCommissionNettedMinor: 1000, cashVisitCharges: 2 }, "KIOREX", { orgRef: "t1", from, to })!;
    assert.deepEqual([older.cashBreakdown.cash.accruedMinor, older.cashBreakdown.cashTransfer.accruedMinor, older.unknownTender.charges], [4000, 0, 0]);
    const newer = normalizeStatement({ cashVisitCommissionAccruedMinor: 5000, cashBreakdown: { cash: { accruedMinor: 3000, nettedMinor: 0, charges: 1 }, cashTransfer: { accruedMinor: 2000, nettedMinor: 500, charges: 1, byDetail: { INSTAPAY: 1, JUNK: 9 } } }, unknownTender: { charges: 3, commissionMinor: 10 } }, "KIOREX", { orgRef: "t1", from, to })!;
    assert.deepEqual([newer.cashBreakdown.cashTransfer.openMinor, newer.cashBreakdown.cashTransfer.byDetail, newer.unknownTender.charges], [1500, { BANK_TRANSFER: 0, INSTAPAY: 1, CARD_TERMINAL: 0 }, 3]);
  });
  it("local mirror: cash accrued and netted, deductions, net payable, reconciliation; and the CSV has the Kiorex rows", () => {
    const v = localStatement({
      orgRef: "t1", from, to, currency: "EGP",
      charges: [{ amountMinor: 3000, status: "CONFIRMED", tender: "CASH" }, { amountMinor: 2000, status: "REVERSED", tender: "CASH" }, { amountMinor: 1500, status: "BILLED", tender: "ONLINE" }],
      claims: [{ collectedMinor: 1000, disputeStatus: null, tender: "CASH" }, { collectedMinor: 0, disputeStatus: null, tender: "ONLINE" }],
      payouts: [{ payoutRef: "po1", paidAt: new Date("2026-12-05T00:00:00Z"), cashMinor: 8500, commissionDeductedMinor: 1500 }],
    });
    assert.deepEqual([v.cashVisitCommissionAccruedMinor, v.cashVisitCommissionNettedMinor, v.cashVisitCommissionOpenMinor, v.cashVisitCharges, v.onlineCollectionsMinor, v.netPayableMinor, v.commission.totalMinor, v.reconciliation], [3000, 1000, 2000, 1, 10000, 8500, 4500, "UNMATCHED"]);
    assert.equal(localStatement({ orgRef: "t1", from, to, currency: "EGP", charges: [], claims: [], payouts: [] }).reconciliation, "NO_PAYOUT");
    assert.equal(localStatement({ orgRef: "t1", from, to, currency: "EGP", charges: [], claims: [{ collectedMinor: 0, disputeStatus: "OPEN", tender: null }], payouts: [] }).reconciliation, "DISPUTED");
    const csv = statementCsv(v);
    assert.match(csv.filename, /^settlement-t1-2026-12-01\.csv$/);
    assert.match(csv.body, /item,amount,deducted,bankReference,status/);
    assert.match(csv.body, /cashVisitCommissionAccrued,30\.00/);
    assert.match(csv.body, /payout:po1,85\.00,15\.00,,UNMATCHED/);
  });
});
