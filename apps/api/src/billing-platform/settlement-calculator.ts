import { KiorlyLineType, PlanKey, type PriceUnit } from "@prisma/client";
import { roundMoney, sumRoundedLineAmounts } from "./settlement-rounding";

export type TrialCommissionPolicy = "WAIVE_ALL" | "WAIVE_UP_TO_PLAN_PRICE" | "CHARGE";

export type SettlementCommissionItem = {
  chargeId: string;
  amount: number;
  patientInitials?: string;
};

export type SettlementAddonItem = {
  descEn: string;
  descAr: string;
  amount: number;
  refId?: string;
};

export type SettlementCalculatorInput = {
  periodKey: string;
  currency: string;
  planKey: PlanKey;
  /** Subscription counted toward higher-of (0 during trial month or prepaid). */
  subscriptionDue: number;
  /** Positive subscription list price before prepaid (for line display). */
  subscriptionList: number;
  seatDue: number;
  seatCount: number;
  seatUnitPrice: number;
  addons: SettlementAddonItem[];
  /** GRW-P2-S: the part of provider-sponsored discounts the clinic wallet could not cover (funding mode WALLET_THEN_INVOICE), one line each. Credit never pays these lines. */
  promotionExpenses?: SettlementAddonItem[];
  usageOverage: number;
  commissionItems: SettlementCommissionItem[];
  commissionGrossBeforeCap: number;
  liteMonthlyCap: number | null;
  trialCoversPeriod: boolean;
  trialCommissionPolicy: TrialCommissionPolicy;
  referencePlanPrice: number;
  prepaidCoversPeriod: boolean;
  walletCreditAvailable: number;
  carryForwardIn: number;
  liteMinInvoice: number;
  taxRatePercent: number;
};

export type SettlementLineDraft = {
  type: KiorlyLineType;
  descEn: string;
  descAr: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  refId?: string | null;
};

export type SettlementSummary = {
  subscriptionList: string;
  commissionGross: string;
  commissionForHigherOf: string;
  subscriptionForHigherOf: string;
  higherOf: string;
  offsetAmount: string;
  kiorexPatientCount: number;
  explanationEn: string;
  explanationAr: string;
  carryForwardIn: string;
  carryForwardOut: string;
  liteMinInvoice: string;
  skippedBelowMinimum: boolean;
};

export type SettlementCalculatorResult = {
  lines: SettlementLineDraft[];
  creditsApplied: number;
  subtotal: number;
  tax: number;
  total: number;
  summary: SettlementSummary;
};

/**
 * Pure monthly settlement — pay the higher of subscription vs commission, never both (CR-06 §04).
 */
function scaleCommissionItemsToGross(
  items: SettlementCommissionItem[],
  grossBeforeCap: number,
  cappedGross: number,
): SettlementCommissionItem[] {
  const scaled: SettlementCommissionItem[] = [];
  let allocated = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (i === items.length - 1) {
      scaled.push({ ...item, amount: roundMoney(cappedGross - allocated) });
      continue;
    }
    const amount = roundMoney((item.amount / grossBeforeCap) * cappedGross);
    allocated = roundMoney(allocated + amount);
    scaled.push({ ...item, amount });
  }
  return scaled;
}

export function settlePeriod(input: SettlementCalculatorInput): SettlementCalculatorResult {
  const lines: SettlementLineDraft[] = [];
  const isLite = input.planKey === PlanKey.LITE;

  let commissionGross = roundMoney(input.commissionGrossBeforeCap);
  if (input.liteMonthlyCap != null && Number.isFinite(input.liteMonthlyCap)) {
    commissionGross = roundMoney(Math.min(commissionGross, input.liteMonthlyCap));
  }

  const subscriptionList = roundMoney(
    isLite ? 0 : input.subscriptionList + (input.seatCount > 0 ? input.seatDue : 0),
  );
  const subscriptionForHigherOf = roundMoney(isLite ? 0 : input.subscriptionDue + input.seatDue);

  let commissionForHigherOf = commissionGross;
  if (input.trialCoversPeriod) {
    if (input.trialCommissionPolicy === "WAIVE_ALL") {
      commissionForHigherOf = 0;
    } else if (input.trialCommissionPolicy === "WAIVE_UP_TO_PLAN_PRICE") {
      commissionForHigherOf = roundMoney(Math.max(0, commissionGross - input.referencePlanPrice));
    }
  }

  const kiorexPatientCount = input.commissionItems.length;

  if (!isLite && input.subscriptionList > 0) {
    lines.push({
      type: KiorlyLineType.SUBSCRIPTION,
      descEn: "Kiorly subscription",
      descAr: "اشتراك كيورلي",
      quantity: 1,
      unitAmount: roundMoney(input.subscriptionList),
      amount: roundMoney(input.subscriptionList),
    });
  }

  if (!isLite && input.seatDue > 0 && input.seatCount > 0) {
    lines.push({
      type: KiorlyLineType.SEAT,
      descEn: `Extra clinician seats (${input.seatCount})`,
      descAr: `مقاعد أطباء إضافية (${input.seatCount})`,
      quantity: input.seatCount,
      unitAmount: roundMoney(input.seatUnitPrice),
      amount: roundMoney(input.seatDue),
    });
  }

  for (const addon of input.addons) {
    const amount = roundMoney(addon.amount);
    if (amount === 0) continue;
    lines.push({
      type: KiorlyLineType.ADDON,
      descEn: addon.descEn,
      descAr: addon.descAr,
      quantity: 1,
      unitAmount: amount,
      amount,
      refId: addon.refId ?? null,
    });
  }

  for (const x of input.promotionExpenses ?? []) {
    const amount = roundMoney(x.amount);
    if (amount <= 0) continue;
    lines.push({ type: KiorlyLineType.PROMOTION_EXPENSE, descEn: x.descEn, descAr: x.descAr, quantity: 1, unitAmount: amount, amount, refId: x.refId ?? null });
  }

  if (input.usageOverage > 0) {
    const amount = roundMoney(input.usageOverage);
    lines.push({
      type: KiorlyLineType.USAGE_OVERAGE,
      descEn: "Usage overage",
      descAr: "تجاوز الاستخدام",
      quantity: 1,
      unitAmount: amount,
      amount,
    });
  }

  const grossBeforeCap = roundMoney(input.commissionGrossBeforeCap);
  const commissionLineItems =
    grossBeforeCap > commissionGross && grossBeforeCap > 0 && input.commissionItems.length > 0
      ? scaleCommissionItemsToGross(input.commissionItems, grossBeforeCap, commissionGross)
      : input.commissionItems;

  if (commissionGross > 0 || commissionLineItems.length > 0) {
    if (commissionLineItems.length > 0) {
      for (const item of commissionLineItems) {
        const amount = roundMoney(item.amount);
        lines.push({
          type: KiorlyLineType.KIOREX_COMMISSION,
          descEn: `Kiorex new patient (${item.patientInitials ?? "—"})`,
          descAr: `مريض جديد كيوركس (${item.patientInitials ?? "—"})`,
          quantity: 1,
          unitAmount: amount,
          amount,
          refId: item.chargeId,
        });
      }
    } else {
      lines.push({
        type: KiorlyLineType.KIOREX_COMMISSION,
        descEn: `Kiorex new patients (${kiorexPatientCount})`,
        descAr: `مرضى جدد من كيوركس (${kiorexPatientCount})`,
        quantity: kiorexPatientCount || 1,
        unitAmount: commissionGross,
        amount: commissionGross,
      });
    }
  }

  const subscriptionStack = subscriptionForHigherOf;
  const commissionStack = commissionForHigherOf;

  let offsetAmount = 0;
  if (!isLite) {
    if (subscriptionStack > 0 && commissionStack > 0) {
      offsetAmount = roundMoney(Math.min(subscriptionStack, commissionStack));
    } else if (subscriptionStack > 0 && commissionGross > 0 && commissionForHigherOf === 0) {
      offsetAmount = roundMoney(Math.min(subscriptionStack, commissionGross));
    } else if (commissionGross > commissionForHigherOf) {
      offsetAmount = roundMoney(commissionGross - commissionForHigherOf);
    }
    if (offsetAmount > 0) {
      lines.push({
        type: KiorlyLineType.KIOREX_COMMISSION_OFFSET,
        descEn:
          commissionForHigherOf === 0 && commissionGross > 0
            ? "Commission offset (trial policy)"
            : "Subscription offset (higher-of Kiorex commission)",
        descAr:
          commissionForHigherOf === 0 && commissionGross > 0
            ? "خصم العمولة (سياسة التجربة)"
            : "خصم الاشتراك (الأعلى بين العمولة والاشتراك)",
        quantity: 1,
        unitAmount: -offsetAmount,
        amount: -offsetAmount,
      });
    }
  }

  if (input.prepaidCoversPeriod && subscriptionList > 0) {
    lines.push({
      type: KiorlyLineType.PREPAID,
      descEn: "Prepaid subscription period",
      descAr: "فترة اشتراك مدفوعة مسبقاً",
      quantity: 1,
      unitAmount: -subscriptionList,
      amount: -subscriptionList,
    });
  }

  let carryForwardOut = 0;
  let skippedBelowMinimum = false;
  if (isLite) {
    const commissionOnly = sumRoundedLineAmounts(lines.map((l) => l.amount));
    const withCarry = roundMoney(commissionOnly + input.carryForwardIn);
    if (withCarry > 0 && withCarry < input.liteMinInvoice) {
      carryForwardOut = withCarry;
      skippedBelowMinimum = true;
    } else if (input.carryForwardIn > 0) {
      lines.push({
        type: KiorlyLineType.KIOREX_COMMISSION,
        descEn: "Carried forward balance (prior periods)",
        descAr: "رصيد مرحّل من فترات سابقة",
        quantity: 1,
        unitAmount: roundMoney(input.carryForwardIn),
        amount: roundMoney(input.carryForwardIn),
        refId: "carry-forward",
      });
    }
  }

  if (skippedBelowMinimum) {
    lines.length = 0;
  }

  let subtotal = skippedBelowMinimum
    ? 0
    : sumRoundedLineAmounts(lines.map((l) => roundMoney(l.amount)));

  let creditsApplied = 0;
  // wallet credit pays fees and subscription; a promotion expense is the clinic's own funding of a patient discount and is invoiced as it is
  const promotionTotal = skippedBelowMinimum ? 0 : sumRoundedLineAmounts(lines.filter((l) => l.type === KiorlyLineType.PROMOTION_EXPENSE).map((l) => roundMoney(l.amount)));
  if (!skippedBelowMinimum && subtotal - promotionTotal > 0 && input.walletCreditAvailable > 0) {
    creditsApplied = roundMoney(Math.min(subtotal - promotionTotal, input.walletCreditAvailable));
  }

  const taxable = roundMoney(Math.max(subtotal - creditsApplied, 0));
  const tax = roundMoney(taxable * (input.taxRatePercent / 100));
  const taxLineAmount = tax;
  if (taxLineAmount > 0) {
    lines.push({
      type: KiorlyLineType.TAX,
      descEn: `VAT (${input.taxRatePercent}%)`,
      descAr: `ضريبة القيمة المضافة (${input.taxRatePercent}%)`,
      quantity: 1,
      unitAmount: taxLineAmount,
      amount: taxLineAmount,
    });
  }

  const total = roundMoney(subtotal - creditsApplied + tax);

  const higherOf = roundMoney(
    Math.max(subscriptionStack, commissionStack) +
      roundMoney(input.addons.reduce((s, a) => s + roundMoney(a.amount), 0) + roundMoney(input.usageOverage)),
  );
  const explanation = buildExplanation({
    currency: input.currency,
    kiorexPatientCount,
    commissionGross,
    subscriptionList,
    higherOf,
    commissionWins: commissionStack >= subscriptionStack && commissionStack > 0,
    subscriptionWins: subscriptionStack > commissionStack,
    isLite,
    skippedBelowMinimum,
    carryForwardOut,
  });

  return {
    lines,
    creditsApplied,
    subtotal: roundMoney(
      lines.filter((l) => l.type !== KiorlyLineType.TAX).reduce((s, l) => s + roundMoney(l.amount), 0),
    ),
    tax,
    total,
    summary: {
      subscriptionList: subscriptionList.toFixed(2),
      commissionGross: commissionGross.toFixed(2),
      commissionForHigherOf: commissionStack.toFixed(2),
      subscriptionForHigherOf: subscriptionStack.toFixed(2),
      higherOf: higherOf.toFixed(2),
      offsetAmount: offsetAmount.toFixed(2),
      kiorexPatientCount,
      explanationEn: explanation.en,
      explanationAr: explanation.ar,
      carryForwardIn: roundMoney(isLite ? input.carryForwardIn : 0).toFixed(2),
      carryForwardOut: carryForwardOut.toFixed(2),
      liteMinInvoice: roundMoney(input.liteMinInvoice).toFixed(2),
      skippedBelowMinimum,
    },
  };
}

function buildExplanation(opts: {
  currency: string;
  kiorexPatientCount: number;
  commissionGross: number;
  subscriptionList: number;
  higherOf: number;
  commissionWins: boolean;
  subscriptionWins: boolean;
  isLite: boolean;
  skippedBelowMinimum: boolean;
  carryForwardOut: number;
}): { en: string; ar: string } {
  if (opts.skippedBelowMinimum) {
    return {
      en: `Lite plan: ${opts.carryForwardOut.toFixed(2)} ${opts.currency} carried forward (below minimum invoice).`,
      ar: `خطة لايت: تم ترحيل ${opts.carryForwardOut.toFixed(2)} ${opts.currency} (أقل من الحد الأدنى للفاتورة).`,
    };
  }
  if (opts.isLite) {
    return {
      en: `Lite plan: Kiorex commission only — ${opts.commissionGross.toFixed(2)} ${opts.currency} this period.`,
      ar: `خطة لايت: عمولة كيوركس فقط — ${opts.commissionGross.toFixed(2)} ${opts.currency} لهذه الفترة.`,
    };
  }
  if (opts.commissionWins && opts.subscriptionList > 0) {
    return {
      en: `Kiorex sent you ${opts.kiorexPatientCount} new patient(s) (${opts.commissionGross.toFixed(2)} ${opts.currency}). That covers your subscription (${opts.subscriptionList.toFixed(2)} ${opts.currency}), so you pay the higher amount only — not both.`,
      ar: `كيوركس أحال ${opts.kiorexPatientCount} مريضاً جديداً (${opts.commissionGross.toFixed(2)} ${opts.currency}). ذلك يغطي اشتراكك (${opts.subscriptionList.toFixed(2)} ${opts.currency}) — تدفع الأعلى فقط وليس المجموع.`,
    };
  }
  if (opts.subscriptionWins && opts.commissionGross > 0) {
    return {
      en: `Subscription (${opts.subscriptionList.toFixed(2)} ${opts.currency}) is higher than Kiorex commission (${opts.commissionGross.toFixed(2)} ${opts.currency}) this month.`,
      ar: `الاشتراك (${opts.subscriptionList.toFixed(2)} ${opts.currency}) أعلى من عمولة كيوركس (${opts.commissionGross.toFixed(2)} ${opts.currency}) هذا الشهر.`,
    };
  }
  if (opts.commissionGross > 0) {
    return {
      en: `Kiorex commission: ${opts.commissionGross.toFixed(2)} ${opts.currency} (${opts.kiorexPatientCount} patient(s)).`,
      ar: `عمولة كيوركس: ${opts.commissionGross.toFixed(2)} ${opts.currency} (${opts.kiorexPatientCount} مريضاً).`,
    };
  }
  return {
    en: `Kiorly subscription: ${opts.subscriptionList.toFixed(2)} ${opts.currency}.`,
    ar: `اشتراك كيورلي: ${opts.subscriptionList.toFixed(2)} ${opts.currency}.`,
  };
}

export function computeSubscriptionAmounts(input: {
  planUnit: PriceUnit;
  baseAmount: number;
  clinicianSeats: number;
  includedClinicians: number;
  extraClinicianAmount: number | null;
}): { subscriptionList: number; seatDue: number; seatCount: number; seatUnitPrice: number } {
  if (input.planUnit === "PER_CLINICIAN") {
    const subscriptionList = roundMoney(input.baseAmount * input.clinicianSeats);
    return { subscriptionList, seatDue: 0, seatCount: 0, seatUnitPrice: 0 };
  }
  const extraSeats = Math.max(0, input.clinicianSeats - input.includedClinicians);
  const extraUnit = input.extraClinicianAmount ?? 0;
  const seatDue = roundMoney(extraSeats * extraUnit);
  return {
    subscriptionList: roundMoney(input.baseAmount),
    seatDue,
    seatCount: extraSeats,
    seatUnitPrice: roundMoney(extraUnit),
  };
}