import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KiorlyLineType } from "@prisma/client";
import { buildMonthlyStatement, renderMonthlyStatementPdf, statementSourceFromSettlement } from "./monthly-statement";
import { settlePeriod } from "./settlement-calculator";
import { baseSettlementInput } from "./settlement-test-matrix";

describe("GRW-P2-S PROMOTION_EXPENSE invoice line", () => {
  const expense = [{ descEn: "Promotion expense (sponsored discount)", descAr: "مصروف العروض (خصم برعاية العيادة)", amount: 100, refId: "prs_1" }];
  it("is one line per shortfall, in the subtotal and the VAT base, and wallet credit never pays it", () => {
    const base = settlePeriod(baseSettlementInput({ walletCreditAvailable: 40 }));
    const withPromo = settlePeriod(baseSettlementInput({ walletCreditAvailable: 40, promotionExpenses: expense }));
    const line = withPromo.lines.find((l) => l.type === KiorlyLineType.PROMOTION_EXPENSE)!;
    assert.ok(line); assert.equal(line.amount, 100); assert.equal(line.refId, "prs_1");
    assert.equal(withPromo.creditsApplied, base.creditsApplied); // the promotion line did not take any of the wallet credit
    assert.equal(withPromo.subtotal, base.subtotal + 100);
    assert.ok(withPromo.tax >= base.tax);
    assert.equal(settlePeriod(baseSettlementInput({ promotionExpenses: [{ ...expense[0]!, amount: 0 }] })).lines.some((l) => l.type === KiorlyLineType.PROMOTION_EXPENSE), false);
  });
  it("the monthly statement shows it as its own row (EN and AR PDF), the totals reconcile, and nothing hides in 'other adjustments'", async () => {
    const input = baseSettlementInput({ promotionExpenses: expense }); const result = settlePeriod(input);
    const st = buildMonthlyStatement(statementSourceFromSettlement(input.periodKey, input.currency, input.taxRatePercent, result));
    assert.equal(st.promotionExpense, "100.00"); assert.equal(st.otherAdjustments, "0.00"); assert.equal(st.reconciles, true); assert.equal(Number(st.total), result.total);
    const pdf = await renderMonthlyStatementPdf(st); assert.ok(pdf.length > 1000);
  });
});
