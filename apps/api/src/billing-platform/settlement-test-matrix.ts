import { PlanKey } from "@prisma/client";
import type { SettlementCalculatorInput } from "./settlement-calculator";

export type SettlementMatrixCase = {
  id: string;
  note: string;
  overrides: Partial<SettlementCalculatorInput>;
  expectedTotal: number;
  extra?: (result: { total: number; creditsApplied: number }) => void;
};

export function baseSettlementInput(overrides: Partial<SettlementCalculatorInput> = {}): SettlementCalculatorInput {
  return {
    periodKey: "2027-04",
    currency: "EGP",
    planKey: PlanKey.PRO,
    subscriptionDue: 0,
    subscriptionList: 0,
    seatDue: 0,
    seatCount: 0,
    seatUnitPrice: 0,
    addons: [],
    usageOverage: 0,
    commissionItems: [],
    commissionGrossBeforeCap: 0,
    liteMonthlyCap: null,
    trialCoversPeriod: false,
    trialCommissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
    referencePlanPrice: 999,
    prepaidCoversPeriod: false,
    walletCreditAvailable: 0,
    carryForwardIn: 0,
    liteMinInvoice: 50,
    taxRatePercent: 0,
    ...overrides,
  };
}

/** CR-06 §04 worked examples (QA-03 matrix). */
export const SECTION_04_MATRIX: SettlementMatrixCase[] = [
  {
    id: "§04-1",
    note: "Commission higher than subscription",
    overrides: {
      subscriptionDue: 999,
      subscriptionList: 999,
      commissionGrossBeforeCap: 1200,
      commissionItems: [{ chargeId: "a", amount: 1200, patientInitials: "AB" }],
    },
    expectedTotal: 1200,
  },
  {
    id: "§04-2",
    note: "Subscription higher than commission",
    overrides: {
      subscriptionDue: 1500,
      subscriptionList: 1500,
      commissionGrossBeforeCap: 800,
      commissionItems: [{ chargeId: "a", amount: 800 }],
    },
    expectedTotal: 1500,
  },
  {
    id: "§04-3",
    note: "Trial WAIVE_ALL",
    overrides: {
      trialCoversPeriod: true,
      trialCommissionPolicy: "WAIVE_ALL",
      commissionGrossBeforeCap: 500,
      commissionItems: [{ chargeId: "a", amount: 500 }],
    },
    expectedTotal: 0,
  },
  {
    id: "§04-4",
    note: "Trial WAIVE_UP_TO below plan",
    overrides: {
      trialCoversPeriod: true,
      trialCommissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
      referencePlanPrice: 999,
      commissionGrossBeforeCap: 600,
      commissionItems: [{ chargeId: "a", amount: 600 }],
    },
    expectedTotal: 0,
  },
  {
    id: "§04-5",
    note: "Trial WAIVE_UP_TO above plan",
    overrides: {
      trialCoversPeriod: true,
      trialCommissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
      referencePlanPrice: 999,
      commissionGrossBeforeCap: 1400,
      commissionItems: [{ chargeId: "a", amount: 1400 }],
    },
    expectedTotal: 401,
  },
  {
    id: "§04-6",
    note: "Trial CHARGE",
    overrides: {
      trialCoversPeriod: true,
      trialCommissionPolicy: "CHARGE",
      commissionGrossBeforeCap: 300,
      commissionItems: [{ chargeId: "a", amount: 300 }],
    },
    expectedTotal: 300,
  },
  {
    id: "§04-7",
    note: "Lite carry below minimum",
    overrides: {
      planKey: PlanKey.LITE,
      commissionGrossBeforeCap: 40,
      commissionItems: [{ chargeId: "a", amount: 40 }],
      liteMinInvoice: 50,
    },
    expectedTotal: 0,
  },
  {
    id: "§04-8",
    note: "Lite carry in crosses minimum",
    overrides: {
      planKey: PlanKey.LITE,
      commissionGrossBeforeCap: 40,
      commissionItems: [{ chargeId: "a", amount: 40 }],
      carryForwardIn: 15,
      liteMinInvoice: 50,
    },
    expectedTotal: 55,
  },
  {
    id: "§04-9",
    note: "Credits after higher-of",
    overrides: {
      subscriptionDue: 999,
      subscriptionList: 999,
      commissionGrossBeforeCap: 200,
      commissionItems: [{ chargeId: "a", amount: 200 }],
      walletCreditAvailable: 100,
    },
    expectedTotal: 899,
    extra: (r) => {
      if (r.creditsApplied !== 100) throw new Error("expected 100 credits applied");
    },
  },
];

export const EDGE_CASE_MATRIX: SettlementMatrixCase[] = [
  {
    id: "EC-01",
    note: "Mid-period plan upgrade (simulated billed amount)",
    overrides: {
      subscriptionDue: 1500,
      subscriptionList: 1500,
      commissionGrossBeforeCap: 400,
      commissionItems: [{ chargeId: "u1", amount: 400 }],
    },
    expectedTotal: 1500,
  },
  {
    id: "EC-02",
    note: "Seat change adds SEAT line",
    overrides: {
      subscriptionDue: 999,
      subscriptionList: 999,
      seatDue: 700,
      seatCount: 2,
      seatUnitPrice: 350,
      commissionGrossBeforeCap: 500,
      commissionItems: [{ chargeId: "s1", amount: 500 }],
    },
    expectedTotal: 1699,
  },
  {
    id: "EC-03",
    note: "Trial ended before period (subscription billable)",
    overrides: {
      trialCoversPeriod: false,
      subscriptionDue: 999,
      subscriptionList: 999,
      commissionGrossBeforeCap: 200,
      commissionItems: [{ chargeId: "t1", amount: 200 }],
    },
    expectedTotal: 999,
  },
  {
    id: "EC-04",
    note: "Disputes after billing reduce commission in period",
    overrides: {
      subscriptionDue: 999,
      subscriptionList: 999,
      commissionGrossBeforeCap: 400,
      commissionItems: [
        { chargeId: "d1", amount: 250 },
        { chargeId: "d2", amount: 150 },
      ],
    },
    expectedTotal: 999,
  },
  {
    id: "EC-05",
    note: "Annual prepay waives subscription stack",
    overrides: {
      prepaidCoversPeriod: true,
      subscriptionDue: 0,
      subscriptionList: 999,
      commissionGrossBeforeCap: 200,
      commissionItems: [{ chargeId: "p1", amount: 200 }],
    },
    expectedTotal: 200,
  },
  {
    id: "EC-06",
    note: "Lite monthly cap on commission (billed uses capped gross)",
    overrides: {
      planKey: PlanKey.LITE,
      liteMonthlyCap: 100,
      commissionGrossBeforeCap: 120,
      commissionItems: [{ chargeId: "l1", amount: 120 }],
      liteMinInvoice: 50,
    },
    expectedTotal: 100,
  },
  {
    id: "EC-07",
    note: "VAT after credits",
    overrides: {
      subscriptionDue: 1000,
      subscriptionList: 1000,
      taxRatePercent: 14,
      walletCreditAvailable: 200,
    },
    expectedTotal: 912,
  },
  {
    id: "EC-08",
    note: "Additive addon and usage on top of higher-of",
    overrides: {
      subscriptionDue: 999,
      subscriptionList: 999,
      commissionGrossBeforeCap: 400,
      commissionItems: [{ chargeId: "a1", amount: 400 }],
      addons: [{ descEn: "SMS pack", descAr: "حزمة رسائل", amount: 150 }],
      usageOverage: 50,
    },
    expectedTotal: 1199,
  },
  {
    id: "EC-09",
    note: "Aggressive currency rounding on lines",
    overrides: {
      subscriptionDue: 10.13,
      subscriptionList: 10.13,
      commissionGrossBeforeCap: 10.13,
      commissionItems: [
        { chargeId: "r1", amount: 5.125 },
        { chargeId: "r2", amount: 5.005 },
      ],
    },
    expectedTotal: 10.14,
  },
];