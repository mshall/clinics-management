/**
 * KX-23 §05 Nurse plans. PROPOSED prices: validate with >= 15 willingness-to-pay interviews before publishing (KX-12, Q13).
 * NEEDS_HUMAN: nothing here is billed or shown as a published price. There are deliberately NO PlanPrice rows for these plans;
 * the numbers live only in this constant so a human decision (CEO) is the only way they become real.
 */
export type NursePlanDef = {
  key: "NURSE_LITE" | "NURSE_PRO" | "NURSE_AGENCY" | "ENTERPRISE";
  nameEn: string;
  nameAr: string;
  audienceEn: string;
  priceStatus: "PROPOSED";
  needsHuman: "NEEDS_HUMAN";
  priceMonthlyEgp: number | null;
  priceAnnualEquivalentEgp: number | null;
  unit: string;
  includedNurses: number | null;
  extraNurseMonthlyEgp: number | null;
  /** Minimum invoice incl. Kiorex fees for Lite (EGP 0 + fees, EGP 100 minimum invoice). */
  minimumInvoiceEgp: number | null;
  includesEn: string;
};

export const NURSE_PLANS: readonly NursePlanDef[] = [
  {
    key: "NURSE_LITE",
    nameEn: "Nurse Lite",
    nameAr: "تمريض لايت",
    audienceEn: "Solo nurse starting out",
    priceStatus: "PROPOSED",
    needsHuman: "NEEDS_HUMAN",
    priceMonthlyEgp: 0,
    priceAnnualEquivalentEgp: 0,
    unit: "per nurse per month + Kiorex fees",
    includedNurses: 1,
    extraNurseMonthlyEgp: null,
    minimumInvoiceEgp: 100,
    includesEn: "Visits, records, vitals, MAR, safety, Kiorex listing (when allowed)",
  },
  {
    key: "NURSE_PRO",
    nameEn: "Nurse Pro",
    nameAr: "تمريض برو",
    audienceEn: "Busy solo nurse",
    priceStatus: "PROPOSED",
    needsHuman: "NEEDS_HUMAN",
    priceMonthlyEgp: 399,
    priceAnnualEquivalentEgp: 299,
    unit: "per nurse per month",
    includedNurses: 1,
    extraNurseMonthlyEgp: null,
    minimumInvoiceEgp: null,
    includesEn: "+ family updates, private-duty shifts, WhatsApp reminders, card/InstaPay/Fawry, reports, sample collection",
  },
  {
    key: "NURSE_AGENCY",
    nameEn: "Nurse Agency",
    nameAr: "تمريض للشركات",
    audienceEn: "Agencies and home-care companies",
    priceStatus: "PROPOSED",
    needsHuman: "NEEDS_HUMAN",
    priceMonthlyEgp: 1999,
    priceAnnualEquivalentEgp: null,
    unit: "per agency per month incl. 10 nurses",
    includedNurses: 10,
    extraNurseMonthlyEgp: 149,
    minimumInvoiceEgp: null,
    includesEn: "+ team, dispatch, nurse pay, multi-branch",
  },
  {
    key: "ENTERPRISE",
    nameEn: "Enterprise",
    nameAr: "مؤسسات",
    audienceEn: "Large home-care operators",
    priceStatus: "PROPOSED",
    needsHuman: "NEEDS_HUMAN",
    priceMonthlyEgp: null,
    priceAnnualEquivalentEgp: null,
    unit: "custom / negotiated",
    includedNurses: null,
    extraNurseMonthlyEgp: null,
    minimumInvoiceEgp: null,
    includesEn: "Custom",
  },
];

/** Home-visit safety (HVSAF) is in every plan including Nurse Lite (KX-23 §05, P5): this is asserted by a test, not configurable. */
export const NURSE_SAFETY_IN_EVERY_PLAN = true as const;
