/** SUB-01: pure helpers of the Upgrade plan screen (no React). The server is the authority for every value; this only shapes it. */
export type EntitlementValue = boolean | number | Record<string, unknown>;
export type PlanPriceRow = { interval: "MONTHLY" | "ANNUAL"; unit: string; amount: string; currency: string; includedClinicians: number; extraClinicianAmount: string | null };
export type DowngradeImpact = {
  fromPlanKey: string; toPlanKey: string; lostFeatures: string[];
  reducedLimits: { key: string; from: number | null; to: number | null; current: number | null; overBy: number }[];
  dataRetained: true; readOnlyGraceDays: number; restoredOnUpgrade: true;
};
export type ComparePlan = {
  key: string; nameEn: string; nameAr: string; isPublic: boolean; relation: "CURRENT" | "UPGRADE" | "DOWNGRADE";
  entitlements: Record<string, EntitlementValue>; prices: PlanPriceRow[]; priceNeedsHuman: boolean; downgradeImpact: DowngradeImpact | null;
};
export type PlanCompare = {
  currentPlanKey: string; edition: string; currency: string | null; taxLine: { ratePercent: number } | null;
  policy: { lapseAction: string; downgradeAfterDays: number; liteReadOnlyGraceDays: number; autoRenewDefault: boolean; proration: { upgradeTiming: string; downgradeTiming: string; creditUnusedOnDowngrade: boolean } };
  usage: Record<string, number>; plans: ComparePlan[];
};
export type RenewalState = {
  plan: { key: string; nameEn: string; nameAr: string }; status: string; onFreePlan: boolean; autoRenew: boolean; autoRenewForced: "ON" | "OFF" | null;
  canChangeAutoRenew: boolean; willDowngradeAtPeriodEnd: boolean; currentPeriodEnd: string; renewsOn: string | null; endsOn: string | null;
  paymentMethod: { id: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  downgradedToLiteAt: string | null; downgradeReason: string | null; liteReadOnlyGraceUntil: string | null;
  previousPlan: { key: string; nameEn: string; nameAr: string } | null; canReactivate: boolean; downgradeImpact: DowngradeImpact | null;
  policy: { lapseAction: string; downgradeAfterDays: number; renewalReminderDaysBefore: number[]; liteReadOnlyGraceDays: number };
};

/** Feature rows grouped for the comparison table (labels come from the strings file by key; an unknown key falls back to the key itself). */
export const FEATURE_GROUPS: { id: string; keys: string[] }[] = [
  { id: "care", keys: ["mod_clinical", "mod_front_desk", "pack_dental", "pack_aesthetics", "pack_physio", "telehealth_video", "home_route_view", "home_dispatch"] },
  { id: "business", keys: ["mod_revenue", "mod_invoices", "mod_expenses", "mod_hr", "mod_payroll", "mod_reports", "mod_operations", "multi_branch"] },
  { id: "patients", keys: ["mod_messaging", "whatsapp_reminders", "deposits", "card_payments", "instapay", "fawry"] },
  { id: "smart", keys: ["ai_assistant", "ai_scribe", "mod_data_explorer", "mod_integrations", "mobile_staff_app"] },
  { id: "support", keys: ["dedicated_support"] },
];
export const NURSE_FEATURE_KEYS = ["nurse_family_updates", "nurse_private_duty_shifts", "nurse_lab_samples", "nurse_agency"];
export const LIMIT_KEYS = ["max_clinicians", "max_branches", "max_assistant_seats"] as const;

export function isOn(v: EntitlementValue | undefined): boolean {
  if (v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return true;
}
/** null = unlimited (negative or absent numeric limit on a plan that has the key as true). */
export function limitOf(v: EntitlementValue | undefined): number | null {
  if (typeof v === "number") return v < 0 ? null : v;
  if (v === true) return null;
  if (v === false) return 0;
  return null;
}
/** Only groups/keys that at least one plan mentions are shown, so a plan catalog without a key never prints an empty row. */
export function visibleFeatureGroups(plans: ComparePlan[], edition: string): { id: string; keys: string[] }[] {
  const groups = edition === "NURSE" ? [...FEATURE_GROUPS, { id: "nurse", keys: NURSE_FEATURE_KEYS }] : FEATURE_GROUPS;
  return groups
    .map((g) => ({ id: g.id, keys: g.keys.filter((k) => plans.some((p) => k in p.entitlements)) }))
    .filter((g) => g.keys.length > 0);
}
export function priceFor(plan: ComparePlan, interval: "MONTHLY" | "ANNUAL"): PlanPriceRow | null {
  return plan.prices.find((p) => p.interval === interval) ?? null;
}
/** Percentage for a usage bar; unlimited or zero limits never divide. */
export function usagePercent(current: number | null | undefined, limit: number | null): number | null {
  if (current == null || limit == null) return null;
  if (limit === 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / limit) * 100));
}
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}
export function isFreePlanKey(key: string): boolean {
  return key === "LITE" || key === "NURSE_LITE";
}
/** The plan keys a "Reactivate" or "Upgrade" action can request. */
export function upgradeTargets(plans: ComparePlan[]): ComparePlan[] {
  return plans.filter((p) => p.relation === "UPGRADE" && p.key !== "ENTERPRISE" && p.isPublic);
}
