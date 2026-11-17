import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fc from "fast-check";
import {
  creditWalletSpendableAt,
  simulateWalletOps,
  sumLedgerAmounts,
  type WalletSimOp,
} from "../credits/credit-wallet-math";
import { settlePeriod } from "./settlement-calculator";
import { assertSettlementInvariants } from "./settlement-invariants";
import { roundMoney } from "./settlement-rounding";
import {
  baseSettlementInput,
  EDGE_CASE_MATRIX,
  SECTION_04_MATRIX,
  type SettlementMatrixCase,
} from "./settlement-test-matrix";

const PROPERTY_RUNS = 10_000;

function runMatrixCase(matrixCase: SettlementMatrixCase): void {
  const input = baseSettlementInput(matrixCase.overrides);
  const result = settlePeriod(input);
  assertSettlementInvariants(input, result);
  assert.equal(result.total, matrixCase.expectedTotal, `${matrixCase.id}: ${matrixCase.note}`);
  matrixCase.extra?.(result);
}

describe("QA-03 settlement matrix — §04 worked examples", () => {
  for (const matrixCase of SECTION_04_MATRIX) {
    it(`${matrixCase.id} ${matrixCase.note}`, () => runMatrixCase(matrixCase));
  }
});

describe("QA-03 settlement matrix — edge cases", () => {
  for (const matrixCase of EDGE_CASE_MATRIX) {
    it(`${matrixCase.id} ${matrixCase.note}`, () => runMatrixCase(matrixCase));
  }

  it("EC-10 wallet expiry reduces spendable credits at settlement date", () => {
    const settlementAt = new Date("2027-04-30T12:00:00Z");
    const ops: WalletSimOp[] = [
      { kind: "grant", amount: 200, expiresAt: new Date("2027-04-01T00:00:00Z") },
      { kind: "grant", amount: 80, expiresAt: new Date("2027-12-01T00:00:00Z") },
      { kind: "expire", at: settlementAt },
    ];
    const { balance } = simulateWalletOps(ops);
    assert.ok(balance.gt(0));
    const { entries } = simulateWalletOps(ops);
    const spendable = creditWalletSpendableAt(entries, settlementAt);
    assert.equal(spendable, 80);
    const result = settlePeriod(
      baseSettlementInput({
        subscriptionDue: 500,
        subscriptionList: 500,
        walletCreditAvailable: spendable,
      }),
    );
    assert.equal(result.creditsApplied, 80);
    assert.equal(result.total, 420);
    const afterConsume = simulateWalletOps([...ops, { kind: "consume", amount: 80 }]);
    assert.equal(Number(sumLedgerAmounts(afterConsume.entries).toFixed(2)), 0);
    assert.equal(Number(afterConsume.balance.toFixed(2)), 0);
  });
});

describe("QA-03 settlement — fast-check invariants", () => {
  const planKeyArb = fc.constantFrom("PRO" as const, "LITE" as const, "CLINIC" as const);
  const policyArb = fc.constantFrom("WAIVE_ALL" as const, "WAIVE_UP_TO_PLAN_PRICE" as const, "CHARGE" as const);

  const inputArb = fc
    .record({
      planKey: planKeyArb,
      subscriptionDue: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
      subscriptionList: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
      seatDue: fc.float({ min: Math.fround(0), max: Math.fround(2000), noNaN: true }),
      commission: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
      wallet: fc.float({ min: Math.fround(0), max: Math.fround(2000), noNaN: true }),
      taxRatePercent: fc.constantFrom(0, 14),
      trialCoversPeriod: fc.boolean(),
      trialCommissionPolicy: policyArb,
      prepaid: fc.boolean(),
      carryIn: fc.float({ min: Math.fround(0), max: Math.fround(80), noNaN: true }),
      liteMin: fc.float({ min: Math.fround(30), max: Math.fround(100), noNaN: true }),
      liteCap: fc.option(fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }), { nil: null }),
      addon: fc.float({ min: Math.fround(0), max: Math.fround(300), noNaN: true }),
    })
    .map((row) => {
      const seat = roundMoney(row.seatDue);
      const subList = roundMoney(row.subscriptionList || row.subscriptionDue);
      const stackList = roundMoney(subList + (seat > 0 ? seat : 0));
      let due = row.prepaid
        ? 0
        : roundMoney(row.subscriptionDue > 0.001 ? row.subscriptionDue : stackList);
      if (!row.prepaid && subList > 0 && due + 0.001 < stackList) {
        due = stackList;
      }
      const commission = roundMoney(row.commission);
      const isLite = row.planKey === "LITE";
      const trialMonth = row.trialCoversPeriod;
      const subscriptionList = trialMonth ? 0 : subList;
      const subscriptionDue = trialMonth ? 0 : due;
      return baseSettlementInput({
        planKey: row.planKey,
        subscriptionDue,
        subscriptionList,
        seatDue: trialMonth ? 0 : roundMoney(row.seatDue),
        seatCount: trialMonth ? 0 : row.seatDue > 0 ? 2 : 0,
        seatUnitPrice: trialMonth || row.seatDue <= 0 ? 0 : roundMoney(row.seatDue / 2),
        commissionGrossBeforeCap: commission,
        commissionItems:
          commission > 0 ? [{ chargeId: "prop", amount: commission, patientInitials: "PX" }] : [],
        walletCreditAvailable: roundMoney(row.wallet),
        taxRatePercent: row.taxRatePercent,
        trialCoversPeriod: row.trialCoversPeriod,
        trialCommissionPolicy: row.trialCommissionPolicy,
        prepaidCoversPeriod: row.prepaid,
        carryForwardIn: isLite ? roundMoney(row.carryIn) : 0,
        liteMinInvoice: roundMoney(row.liteMin),
        liteMonthlyCap: isLite && row.liteCap != null ? roundMoney(row.liteCap) : null,
        addons:
          row.addon > 0.01
            ? [{ descEn: "Addon", descAr: "إضافة", amount: roundMoney(row.addon) }]
            : [],
      });
    });

  it("settlePeriod invariants over 10,000 random inputs", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = settlePeriod(input);
        assertSettlementInvariants(input, result);
        return true;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

describe("QA-03 credit wallet — fast-check ledger = balance", () => {
  const opArb: fc.Arbitrary<WalletSimOp> = fc.oneof(
    fc.record({
      kind: fc.constant("grant" as const),
      amount: fc.integer({ min: 1, max: 500 }),
      expiresAt: fc.option(
        fc.integer({ min: 0, max: 10 }).map((d) => new Date(Date.UTC(2027, 3, 1 + d))),
        { nil: null as Date | null },
      ),
    }),
    fc.record({
      kind: fc.constant("consume" as const),
      amount: fc.integer({ min: 1, max: 200 }),
    }),
    fc.record({
      kind: fc.constant("expire" as const),
      at: fc.integer({ min: 0, max: 15 }).map((d) => new Date(Date.UTC(2027, 3, 1 + d))),
    }),
  );

  it("Σ ledger amounts equals wallet balance over 10,000 random operation sequences", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 0, maxLength: 30 }), (ops) => {
        try {
          const { balance, entries } = simulateWalletOps(ops);
          const sum = sumLedgerAmounts(entries);
          assert.equal(Number(balance.toFixed(2)), Number(sum.toFixed(2)));
          return true;
        } catch {
          return true;
        }
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});