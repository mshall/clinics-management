import assert from "node:assert/strict";
import { PlanKey } from "@prisma/client";
import type { SettlementCalculatorInput, SettlementCalculatorResult } from "./settlement-calculator";
import { roundMoney } from "./settlement-rounding";

/**
 * QA-03 billing invariants for `settlePeriod` results.
 */
export function assertSettlementInvariants(
  input: SettlementCalculatorInput,
  result: SettlementCalculatorResult,
): void {
  assert.ok(Number.isFinite(result.total), "total must be finite");
  assert.ok(result.total >= -0.0001, "payable (total) must be >= 0");

  const isLite = input.planKey === PlanKey.LITE;
  const subscriptionStack = isLite
    ? 0
    : roundMoney(input.subscriptionDue + input.seatDue);
  const c = Number(result.summary.commissionForHigherOf);
  const core = roundMoney(Math.max(subscriptionStack, c));
  assert.ok(result.creditsApplied >= 0);
  assert.ok(result.creditsApplied <= roundMoney(input.walletCreditAvailable + 0.0001));
  assert.ok(result.creditsApplied <= roundMoney(result.subtotal + 0.0001));

  if (result.summary.skippedBelowMinimum) {
    assert.equal(result.total, 0);
    assert.equal(result.lines.length, 0);
    assert.ok(Number(result.summary.carryForwardOut) >= 0);
    return;
  }

  const addonUsage = roundMoney(
    input.addons.reduce((acc, row) => acc + row.amount, 0) + input.usageOverage,
  );
  const payableBeforeTax = roundMoney(result.total - result.tax + result.creditsApplied);
  const payableCore = roundMoney(payableBeforeTax - addonUsage);

  if (!isLite && !input.prepaidCoversPeriod && !result.summary.skippedBelowMinimum) {
    assert.ok(
      payableCore <= core + addonUsage + 0.02,
      `payable core ${payableCore} must be <= max(S,C)+addons ${core + addonUsage}`,
    );
  }

  if (isLite) {
    assert.equal(subscriptionStack, 0);
    assert.ok(c >= 0 || result.total === 0);
    assert.ok(payableCore >= c - 0.02 || input.carryForwardIn > 0);
  }
}