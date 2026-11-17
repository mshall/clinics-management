import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClinicalSpecialty, FeeType, Prisma } from "@prisma/client";
import {
  applyPercentCommission,
  isRateActive,
  resolveKiorexCommissionRate,
  type RateRow,
} from "./kiorex-commission-resolver";

function row(
  partial: Partial<RateRow> & Pick<RateRow, "id" | "marketId" | "feeType" | "validFrom">,
): RateRow {
  return {
    specialty: null,
    amount: null,
    percent: null,
    minAmount: null,
    maxAmount: null,
    benchmarkFlat: null,
    benchmarkPercent: null,
    benchmarkSource: null,
    benchmarkCheckedAt: null,
    validTo: null,
    ...partial,
  };
}

describe("CR-04 Kiorex commission resolver", () => {
  const at = new Date("2026-06-01T12:00:00.000Z");

  it("specialty override beats market default; expired rows ignored", () => {
    const marketDefault = row({
      id: "m",
      marketId: "mk",
      feeType: FeeType.FLAT,
      amount: new Prisma.Decimal(50),
      validFrom: new Date("2026-01-01"),
    });
    const dental = row({
      id: "d",
      marketId: "mk",
      feeType: FeeType.FLAT,
      specialty: ClinicalSpecialty.DENTISTRY,
      amount: new Prisma.Decimal(30),
      validFrom: new Date("2026-01-01"),
    });
    const expired = row({
      id: "x",
      marketId: "mk",
      feeType: FeeType.FLAT,
      specialty: ClinicalSpecialty.DENTISTRY,
      amount: new Prisma.Decimal(5),
      validFrom: new Date("2024-01-01"),
      validTo: new Date("2025-01-01"),
    });

    const resolved = resolveKiorexCommissionRate([marketDefault, dental, expired], ClinicalSpecialty.DENTISTRY, at);
    assert.equal(resolved?.id, "d");

    const fallback = resolveKiorexCommissionRate([marketDefault, expired], ClinicalSpecialty.DENTISTRY, at);
    assert.equal(fallback?.id, "m");

    assert.equal(isRateActive(expired, at), false);
  });

  it("PERCENT rates respect min/max", () => {
    assert.equal(applyPercentCommission(200, 10, 25, 40), 25);
    assert.equal(applyPercentCommission(1000, 10, 25, 40), 40);
    assert.equal(applyPercentCommission(300, 10, 25, 40), 30);
  });
});