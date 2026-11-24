import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AcquisitionOrigin, BookingSource, CommissionDecisionKind } from "@prisma/client";
import {
  DECISION_REASON,
  DEFAULT_COMMISSION_HANDLING,
  commissionPolicyVersion,
  decideCommissionGate,
  decisionInputsHash,
  resolveCommissionHandling,
  type DecisionRowInput,
} from "./commission-decision";
import { isCommissionChargeableBooking } from "../appointments/booking-attribution";
import { evidenceConfirmsProviderLed } from "./attribution-evidence.service";
import { explainDecision } from "./commission-decisions.service";
import { fromMinor, reconcileStatement, toMinor, type StatementCharge, type StatementDecision } from "./commission-reconciliation";

describe("GRW-P1-D2 commission gate (pure, deterministic)", () => {
  it("PROVIDER_LED never charges, whatever the source or patient", () => {
    for (const source of Object.values(BookingSource)) for (const isNew of [true, false]) {
      const g = decideCommissionGate({ origin: AcquisitionOrigin.PROVIDER_LED, bookingSource: source, isNewPatient: isNew, followUpVisit: false });
      assert.equal(g.decision, "NO_CHARGE");
      assert.ok(g.reasonCodes.includes(DECISION_REASON.PROVIDER_LED));
    }
  });
  it("agrees with isCommissionChargeableBooking for every combination (one source of truth for who pays)", () => {
    for (const source of Object.values(BookingSource)) for (const isNew of [true, false]) for (const origin of [null, AcquisitionOrigin.UNATTRIBUTED, AcquisitionOrigin.MARKETPLACE, AcquisitionOrigin.PROVIDER_LED]) {
      const g = decideCommissionGate({ origin, bookingSource: source, isNewPatient: isNew, followUpVisit: false });
      assert.equal(g.decision === "CHARGE", isCommissionChargeableBooking(source, isNew, origin), `${source}/${isNew}/${origin}`);
    }
  });
  it("KIOREX_ORIGINATED new patient charges; returning, follow-up, clinic link and non-Kiorex sources do not, each with its own reason", () => {
    const base = { origin: AcquisitionOrigin.MARKETPLACE, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatient: true, followUpVisit: false };
    assert.deepEqual(decideCommissionGate(base), { decision: "CHARGE", reasonCodes: ["KIOREX_NEW_PATIENT", "MARKETPLACE_ORIGIN"] });
    assert.deepEqual(decideCommissionGate({ ...base, origin: null }).reasonCodes, ["KIOREX_NEW_PATIENT", "UNATTRIBUTED_TREATED_AS_MARKETPLACE"]);
    assert.deepEqual(decideCommissionGate({ ...base, isNewPatient: false }).reasonCodes, ["RETURNING_PATIENT"]);
    assert.deepEqual(decideCommissionGate({ ...base, followUpVisit: true }).reasonCodes, ["FOLLOW_UP_VISIT"]);
    assert.deepEqual(decideCommissionGate({ ...base, bookingSource: BookingSource.CLINIC_LINK }).reasonCodes, ["CLINIC_LINK_CHANNEL"]);
    assert.deepEqual(decideCommissionGate({ ...base, bookingSource: BookingSource.FRONT_DESK }).reasonCodes, ["SOURCE_NOT_COMMISSIONABLE"]);
    assert.deepEqual(decideCommissionGate({ ...base, bookingSource: BookingSource.INTEGRATION }).decision, "CHARGE");
  });
  it("determinism: 1000 replays of the same input give byte-identical output", () => {
    const input = { origin: AcquisitionOrigin.PROVIDER_LED, bookingSource: BookingSource.CLINIC_LINK, isNewPatient: false, followUpVisit: true };
    const first = JSON.stringify(decideCommissionGate(input));
    for (let i = 0; i < 1000; i += 1) assert.equal(JSON.stringify(decideCommissionGate({ ...input })), first);
  });
});

describe("GRW-P1-D2 versioned policy and inputs hash", () => {
  it("policy version is the id plus the effective date of the rate set in force (read from the rate rows)", () => {
    const rates = [{ validFrom: new Date("2026-01-01") }, { validFrom: new Date("2026-07-01") }, { validFrom: new Date("2027-01-01") }];
    assert.equal(commissionPolicyVersion(rates, new Date("2026-03-01")), "CP1@2026-01-01");
    assert.equal(commissionPolicyVersion(rates, new Date("2026-07-01T00:00:00Z")), "CP1@2026-07-01");
    assert.equal(commissionPolicyVersion(rates, new Date("2026-12-31")), "CP1@2026-07-01");
    assert.equal(commissionPolicyVersion(rates, new Date("2025-01-01")), "CP1@base");
    assert.equal(commissionPolicyVersion([], new Date()), "CP1@base");
    // an ended rate no longer defines the version, so a re-check-in under the older rate appends a new decision instead of reusing a stale one
    const ended = [{ validFrom: new Date("2020-01-01") }, { validFrom: new Date("2026-01-01"), validTo: new Date("2025-01-01") }];
    assert.equal(commissionPolicyVersion(ended, new Date("2026-06-02")), "CP1@2020-01-01");
  });
  const row: DecisionRowInput = { tenantId: "t", clinicId: "c", appointmentId: "a1", policyVersion: "CP1@2026-01-01", origin: AcquisitionOrigin.MARKETPLACE, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatient: true, followUpVisit: false, decision: CommissionDecisionKind.CHARGE, reasonCodes: ["KIOREX_NEW_PATIENT"], rateId: "r1", amount: "40.00" };
  it("inputs hash is 64 hex, stable, order-insensitive for extra keys, and changes with any input", () => {
    const h = decisionInputsHash(row);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(decisionInputsHash({ ...row }), h);
    assert.equal(decisionInputsHash({ ...row, extra: { b: 1, a: 2 } }), decisionInputsHash({ ...row, extra: { a: 2, b: 1 } }));
    for (const change of [{ appointmentId: "a2" }, { origin: AcquisitionOrigin.PROVIDER_LED }, { amount: "41.00" }, { policyVersion: "CP1@2026-07-01" }, { isNewPatient: false }]) assert.notEqual(decisionInputsHash({ ...row, ...change }), h);
  });
  it("market handling of cancelled / no-show / refunded defaults to today's behaviour and is configurable", () => {
    assert.deepEqual(resolveCommissionHandling(null), DEFAULT_COMMISSION_HANDLING);
    assert.deepEqual(resolveCommissionHandling({ kiorex: { commissionHandling: { cancelledNoShow: "KEEP", refunded: "NONE" } } }), { cancelledNoShow: "KEEP", refunded: "NONE" });
    assert.deepEqual(resolveCommissionHandling({ kiorex: { commissionHandling: { cancelledNoShow: "bogus" } } }), DEFAULT_COMMISSION_HANDLING);
  });
});

describe("GRW-P1-D2 evidence", () => {
  const dec = (origin: "PROVIDER_LED" | "MARKETPLACE") => ({ id: "d", origin, reason: "X", policyVersion: "v" });
  it("evidence can only confirm a provider touch; it never creates a charge", () => {
    assert.equal(evidenceConfirmsProviderLed({ bookingId: "b", decision: dec("PROVIDER_LED") }), true);
    assert.equal(evidenceConfirmsProviderLed({ bookingId: "b", decision: dec("MARKETPLACE"), touches: [{ id: "t", kind: "PROVIDER_QR", winning: true }] }), true);
    assert.equal(evidenceConfirmsProviderLed({ bookingId: "b", decision: dec("MARKETPLACE"), touches: [{ id: "t", kind: "PROVIDER_QR", winning: false }, { id: "u", kind: "ORGANIC_SEARCH", winning: true }] }), false);
    assert.equal(evidenceConfirmsProviderLed(null), false);
  });
  it("founder-readable explanations exist for every reason code the gate can emit", () => {
    for (const code of Object.values(DECISION_REASON)) assert.ok(explainDecision("NO_CHARGE", [code]).length > 10, code);
    assert.match(explainDecision("CHARGE", ["KIOREX_NEW_PATIENT"]), /^Fee applied\./);
  });
});

const D = (appointmentId: string, decision: StatementDecision["decision"], amount: string | null, at = "2026-11-10T10:00:00Z", extra: Partial<StatementDecision> = {}): StatementDecision =>
  ({ appointmentId, policyVersion: "CP1@base", decision, origin: "MARKETPLACE", reasonCodes: decision === "CHARGE" ? ["KIOREX_NEW_PATIENT"] : ["PROVIDER_LED"], amount, createdAt: new Date(at), ...extra });
const C = (appointmentId: string, amount: string, status: StatementCharge["status"] = "CONFIRMED", reversalReason: string | null = null): StatementCharge => ({ appointmentId, amount, status, reversalReason });

describe("GRW-P1-D2 reconciliation", () => {
  it("minor units are exact (no float drift)", () => {
    assert.equal(toMinor("0.10") + toMinor("0.20"), 30);
    assert.equal(fromMinor(toMinor("1234.56")), "1234.56");
  });
  it("a clean month reconciles: charges match CHARGE decisions, NO_CHARGE has no charge", () => {
    const r = reconcileStatement([D("a1", "CHARGE", "40.00"), D("a2", "CHARGE", "40.00"), D("a3", "NO_CHARGE", null, undefined, { origin: "PROVIDER_LED" })], [C("a1", "40.00"), C("a2", "40.00", "BILLED")]);
    assert.equal(r.reconciled, true);
    assert.deepEqual(r.totals, { expectedFromDecisions: "80.00", activeCharges: "80.00", reversedOrWaived: "0.00" });
    assert.deepEqual(r.byDecision, { CHARGE: 2, NO_CHARGE: 1, WAIVED: 0 });
    assert.deepEqual(r.byOrigin, { MARKETPLACE: 2, PROVIDER_LED: 1 });
    assert.deepEqual(r.noChargeReasons, { PROVIDER_LED: 1 });
  });
  it("reversed or waived charges are explained, not mismatches; the latest decision wins (evidence adjustment)", () => {
    const r = reconcileStatement(
      [D("a1", "CHARGE", "40.00", "2026-11-10T10:00:00Z"), D("a1", "NO_CHARGE", null, "2026-11-12T10:00:00Z", { policyVersion: "CP1@base+PLE", origin: "PROVIDER_LED" }), D("a2", "CHARGE", "40.00")],
      [C("a1", "40.00", "REVERSED", "dispute_approved"), C("a2", "40.00", "REVERSED", "appointment_cancelled_or_no_show")],
    );
    assert.equal(r.reconciled, true);
    assert.equal(r.totals.reversedOrWaived, "80.00");
    assert.equal(r.totals.activeCharges, "0.00");
  });
  it("finds every kind of mismatch", () => {
    const r = reconcileStatement(
      [D("a1", "CHARGE", "40.00"), D("a2", "NO_CHARGE", null), D("a3", "CHARGE", "40.00")],
      [C("a2", "40.00"), C("a3", "45.00"), C("a4", "40.00")],
    );
    assert.equal(r.reconciled, false);
    assert.deepEqual(r.mismatches.map((m) => [m.appointmentId, m.kind]), [
      ["a1", "NO_CHARGE_ROW_FOR_CHARGE_DECISION"],
      ["a2", "ACTIVE_CHARGE_FOR_NO_CHARGE_DECISION"],
      ["a3", "AMOUNT_MISMATCH"],
      ["a4", "ACTIVE_CHARGE_WITHOUT_DECISION"],
    ]);
  });
  it("is order independent and replayable (determinism)", () => {
    const ds = [D("a1", "CHARGE", "40.00"), D("a2", "NO_CHARGE", null), D("a3", "CHARGE", "40.00", "2026-11-11T00:00:00Z")];
    const cs = [C("a1", "40.00"), C("a3", "40.00")];
    const a = JSON.stringify(reconcileStatement(ds, cs));
    assert.equal(JSON.stringify(reconcileStatement([...ds].reverse(), [...cs].reverse())), a);
  });
});
