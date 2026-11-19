import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveKiorexImpact, matchesStatement } from "./kiorex-impact";
import {
  buildMonthlyStatement,
  statementSourceFromSettlement,
} from "../billing-platform/monthly-statement";
import { settlePeriod } from "../billing-platform/settlement-calculator";
import { baseSettlementInput, SECTION_04_MATRIX } from "../billing-platform/settlement-test-matrix";

describe("RP-03 Kiorex impact", () => {
  it("derives net cost per new patient from commission minus offset", () => {
    const d = deriveKiorexImpact({
      bookings: 10,
      attended: 8,
      newPatients: 4,
      visitRevenue: 4000,
      commission: 200,
      offset: 80,
    });
    assert.equal(d.netCommissionCost, 120);
    assert.equal(d.netCostPerNewPatient, 30);
    assert.equal(d.revenuePerNewPatient, 1000);
  });

  it("matches CR-11 statement offset for every §04 settlement case", () => {
    for (const matrixCase of SECTION_04_MATRIX) {
      const input = baseSettlementInput(matrixCase.overrides);
      const result = settlePeriod(input);
      const st = buildMonthlyStatement(
        statementSourceFromSettlement(input.periodKey, input.currency, input.taxRatePercent, result),
      );
      if (result.summary.skippedBelowMinimum) {
        assert.equal(Number(st.offset), 0, `${matrixCase.id} skipped → no statement offset`);
        continue;
      }
      const offset = Number(result.summary.offsetAmount);
      assert.equal(offset, Number(st.offset), `${matrixCase.id} offset`);
      assert.equal(
        matchesStatement(
          { commission: Number(st.commissionTotal), offset },
          { commission: Number(st.commissionTotal), offset: Number(st.offset) },
        ),
        true,
        matrixCase.id,
      );
    }
  });
});
