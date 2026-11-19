import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";
import { KiorlyLineType } from "@prisma/client";
import { loadArabicFont, shapeArabic, toVisualOrder } from "./bilingual-pdf";
import {
  buildMonthlyStatement,
  renderMonthlyStatementPdf,
  statementSourceFromSettlement,
} from "./monthly-statement";
import { settlePeriod } from "./settlement-calculator";
import { roundMoney } from "./settlement-rounding";
import { baseSettlementInput, EDGE_CASE_MATRIX, SECTION_04_MATRIX } from "./settlement-test-matrix";

const ALL_CR06_CASES = [...SECTION_04_MATRIX, ...EDGE_CASE_MATRIX];

describe("CR-11 statement totals equal invoice totals (every CR-06 case)", () => {
  for (const matrixCase of ALL_CR06_CASES) {
    it(`${matrixCase.id} ${matrixCase.note}`, () => {
      const input = baseSettlementInput(matrixCase.overrides);
      const result = settlePeriod(input);
      const st = buildMonthlyStatement(
        statementSourceFromSettlement(input.periodKey, input.currency, input.taxRatePercent, result),
      );
      assert.equal(Number(st.total), result.total, "total");
      assert.equal(Number(st.total), matrixCase.expectedTotal, "expected CR-06 total");
      assert.equal(Number(st.subtotal), result.subtotal, "subtotal");
      assert.equal(Number(st.vat), result.tax, "VAT");
      assert.equal(Number(st.creditsUsed), result.creditsApplied, "credits used");
      assert.equal(Number(st.netPayable), roundMoney(result.subtotal - result.creditsApplied), "net payable");
      assert.equal(st.reconciles, true);
      assert.equal(st.skippedBelowMinimum, result.summary.skippedBelowMinimum);
      if (!result.summary.skippedBelowMinimum) {
        assert.equal(Number(st.offset), Number(result.summary.offsetAmount), "offset");
      }
    });
  }
});

describe("CR-11 statement components", () => {
  it("commission total equals the sum of patient fees (Lite cap scaling EC-06)", () => {
    const input = baseSettlementInput({
      planKey: "LITE",
      liteMonthlyCap: 100,
      commissionGrossBeforeCap: 150,
      commissionItems: [
        { chargeId: "c1", amount: 90, patientInitials: "AB" },
        { chargeId: "c2", amount: 60, patientInitials: "CD" },
      ],
    });
    const result = settlePeriod(input);
    const fees = result.lines
      .filter((l) => l.type === KiorlyLineType.KIOREX_COMMISSION)
      .map((l) => ({
        chargeId: l.refId!,
        attendedAt: "2027-04-03T10:00:00.000Z",
        doctorName: "Dr X",
        patientInitials: "AB",
        fee: l.amount.toFixed(2),
      }));
    const st = buildMonthlyStatement(
      statementSourceFromSettlement(input.periodKey, input.currency, 0, result, { patients: fees }),
    );
    assert.equal(st.kiorexPatientCount, 2);
    assert.equal(Number(st.commissionTotal), 100);
    assert.equal(
      roundMoney(st.kiorexPatients.reduce((s, p) => s + Number(p.fee), 0)),
      Number(st.commissionTotal),
    );
  });

  it("subscription block splits plan, seats, add-ons and usage", () => {
    const input = baseSettlementInput({
      subscriptionDue: 999,
      subscriptionList: 999,
      seatDue: 700,
      seatCount: 2,
      seatUnitPrice: 350,
      addons: [{ descEn: "SMS", descAr: "رسائل", amount: 150 }],
      usageOverage: 50,
    });
    const st = buildMonthlyStatement(
      statementSourceFromSettlement(input.periodKey, input.currency, 0, settlePeriod(input)),
    );
    assert.deepEqual(st.subscription, {
      subscription: "999.00",
      seats: "700.00",
      addons: "150.00",
      usage: "50.00",
      total: "1899.00",
    });
  });

  it("reports wallet balance, payments and amount due", () => {
    const input = baseSettlementInput({ subscriptionDue: 1000, subscriptionList: 1000, walletCreditAvailable: 200 });
    const result = settlePeriod(input);
    const src = statementSourceFromSettlement(input.periodKey, input.currency, 0, result, {
      walletBalance: 350,
      payments: [
        { id: "p1", createdAt: "2027-05-02T00:00:00.000Z", provider: "manual", amount: "300.00", currency: "EGP", status: "SUCCEEDED" },
      ],
    });
    const st = buildMonthlyStatement({ ...src, amountPaid: 300 });
    assert.equal(st.walletBalance, "350.00");
    assert.equal(st.creditsUsed, "200.00");
    assert.equal(st.total, "800.00");
    assert.equal(st.amountPaid, "300.00");
    assert.equal(st.amountDue, "500.00");
    assert.equal(st.payments.length, 1);
  });

  it("flags a mismatch between lines and persisted totals", () => {
    const input = baseSettlementInput({ subscriptionDue: 500, subscriptionList: 500 });
    const src = statementSourceFromSettlement(input.periodKey, input.currency, 0, settlePeriod(input));
    const st = buildMonthlyStatement({ ...src, expected: { subtotal: 500, total: 510 } });
    assert.equal(st.reconciles, false);
  });
});

describe("CR-11 bilingual PDF", () => {
  it("shapes Arabic letters into joined presentation forms and lam-alef ligatures", () => {
    assert.equal(shapeArabic("\u0644\u0627"), "\ufefb");
    assert.equal(shapeArabic("\u0628\u0628"), "\ufe91\ufe90");
    assert.equal(shapeArabic("\u0628\u0628\u0628"), "\ufe91\ufe92\ufe90");
    assert.equal(shapeArabic("\u062f\u0628"), "\ufea9\ufe8f");
  });

  it("keeps numbers left-to-right inside RTL text and mirrors brackets", () => {
    const visual = toVisualOrder("\u0636 (14%)", "rtl");
    assert.ok(visual.includes("14%"), visual);
    assert.ok(visual.startsWith("(") && visual.includes(")"), visual);
    assert.ok(visual.endsWith("\ufebd"), visual);
  });

  it("renders an English page and an Arabic page with the embedded Arabic font", () => {
    assert.ok(loadArabicFont(), "Arabic font asset must be present under apps/api/assets/fonts");
    const input = baseSettlementInput({
      subscriptionDue: 999,
      subscriptionList: 999,
      commissionGrossBeforeCap: 1200,
      commissionItems: [{ chargeId: "a", amount: 1200, patientInitials: "AB" }],
      taxRatePercent: 14,
    });
    const result = settlePeriod(input);
    const st = buildMonthlyStatement(
      statementSourceFromSettlement(input.periodKey, input.currency, 14, result, {
        patients: [
          { chargeId: "a", attendedAt: "2027-04-03T10:00:00.000Z", doctorName: "Dr Sara", patientInitials: "AB", fee: "1200.00" },
        ],
      }),
    );
    const pdf = renderMonthlyStatementPdf(st);
    const text = pdf.toString("latin1");
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.ok(text.trimEnd().endsWith("%%EOF"));
    assert.match(text, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 2/);
    assert.match(text, /\/FontFile2 \d+ 0 R/);
    assert.match(text, /\/Encoding \/Identity-H/);
    assert.match(text, /Kiorly monthly statement/);
    assert.match(text, /Dr Sara/);
    assert.match(text, /\/F2 \d+ Tf [\d.]+ [\d.]+ Td <[0-9a-f]+> Tj/);

    const streamMatch = /\/Length (\d+) \/Length1 (\d+) \/Filter \/FlateDecode >>\nstream\n/.exec(text);
    assert.ok(streamMatch);
    const start = streamMatch.index + streamMatch[0].length;
    const font = inflateSync(pdf.subarray(start, start + Number(streamMatch[1])));
    assert.equal(font.length, Number(streamMatch[2]));
  });
});
