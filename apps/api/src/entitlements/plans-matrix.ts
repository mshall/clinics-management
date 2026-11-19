import { PlanKey } from "@prisma/client";
import type { FeatureFlagKey } from "../feature-flags/feature-flag-keys";

/** Canonical entitlement keys (PL-04). Source for seed, docs, and controller map. */
export const MODULE_ENTITLEMENT_KEYS = [
  "mod_clinical",
  "mod_front_desk",
  "mod_operations",
  "mod_invoices",
  "mod_revenue",
  "mod_expenses",
  "mod_hr",
  "mod_payroll",
  "mod_reports",
  "mod_messaging",
  "mod_integrations",
  "mod_data_explorer",
  "ai_assistant",
  "ai_scribe",
  "deposits",
  "multi_branch",
  "whatsapp_reminders",
  "card_payments",
  "instapay",
  "fawry",
  "dedicated_support",
  "pack_dental",
  "pack_aesthetics",
  "pack_physio",
  "max_clinicians",
  "max_branches",
  "max_assistant_seats",
] as const;

export type ModuleEntitlementKey = (typeof MODULE_ENTITLEMENT_KEYS)[number];

export type EntitlementSeedValue = boolean | number | string | Record<string, unknown>;

export type ControllerPolicy =
  | { kind: "open" }
  | { kind: "platform" }
  | { kind: "webhook" }
  | { kind: "gated"; entitlement: string }
  | { kind: "mixed"; entitlement: string; minDecorators: number };

/** Relative path under `apps/api/src`. */
export const CONTROLLER_ENTITLEMENT_POLICIES: Record<string, ControllerPolicy> = {
  "admin/platform-admin.controller.ts": { kind: "platform" },
  "admin/admin.controller.ts": { kind: "open" },
  "admin/data-explorer/admin-data-explorer.controller.ts": { kind: "gated", entitlement: "mod_data_explorer" },
  "appointments/appointments.controller.ts": { kind: "open" },
  "appointments/deposit-links.controller.ts": { kind: "gated", entitlement: "deposits" },
  "appointments/public-deposit-link.controller.ts": { kind: "open" },
  "assistant/assistant.controller.ts": { kind: "gated", entitlement: "ai_assistant" },
  "auth/auth.controller.ts": { kind: "open" },
  "billing/billing.controller.ts": { kind: "open" },
  "billing/patient-money.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "billing/cashier-shifts.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "billing/split-payments.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "billing/claims.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "revenue-share/revenue-share.controller.ts": { kind: "gated", entitlement: "mod_revenue" },
  "growth/growth-referral.controller.ts": { kind: "open" },
  "billing-platform/kiorly-invoices.controller.ts": { kind: "open" },
  "billing-platform/kiorly-billing-payments.controller.ts": { kind: "open" },
  "billing-platform/kiorly-payments-webhook.controller.ts": { kind: "webhook" },
  "billing-platform/settlement.controller.ts": { kind: "open" },
  "billing-platform/kiorex-progress.controller.ts": { kind: "open" },
  "billing-platform/monthly-statement.controller.ts": { kind: "open" },
  "clinic-ai/clinic-ai.controller.ts": { kind: "mixed", entitlement: "ai_scribe", minDecorators: 4 },
  "clinical/clinical.controller.ts": { kind: "gated", entitlement: "mod_clinical" },
  "clinical/rx-share.controller.ts": { kind: "open" },
  "cohorts/public-cohorts.controller.ts": { kind: "open" },
  "clinician-verification/clinician-verification.controller.ts": { kind: "open" },
  "clinician-verification/platform-verifications.controller.ts": { kind: "platform" },
  "clinics/clinics.controller.ts": { kind: "open" },
  "compliance/compliance.controller.ts": { kind: "open" },
  "exports/exports.controller.ts": { kind: "open" },
  "dashboard/dashboard.controller.ts": { kind: "open" },
  "encounters/encounters.controller.ts": { kind: "open" },
  "expenses/expenses.controller.ts": { kind: "gated", entitlement: "mod_expenses" },
  "front-desk/front-desk.controller.ts": { kind: "gated", entitlement: "mod_front_desk" },
  "health/health.controller.ts": { kind: "open" },
  "hr/hr.controller.ts": { kind: "gated", entitlement: "mod_hr" },
  "integrations/integration-admin.controller.ts": { kind: "gated", entitlement: "mod_integrations" },
  "integrations/integration-webhooks-admin.controller.ts": { kind: "gated", entitlement: "mod_integrations" },
  "integrations/integrations-appointments.controller.ts": { kind: "gated", entitlement: "mod_integrations" },
  "integrations/integrations-operations.controller.ts": { kind: "gated", entitlement: "mod_integrations" },
  "invoices/invoices.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "legal/legal.controller.ts": { kind: "open" },
  "legal/public-legal.controller.ts": { kind: "open" },
  "markets/markets.controller.ts": { kind: "platform" },
  "markets/tenant-market.controller.ts": { kind: "open" },
  "messaging/installment-reminders.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "messaging/digests.controller.ts": { kind: "open" },
  "push/push.controller.ts": { kind: "open" },
  "messaging/messaging.controller.ts": { kind: "gated", entitlement: "mod_messaging" },
  "messaging/whatsapp-ai-receptionist.controller.ts": { kind: "gated", entitlement: "mod_messaging" },
  "onboarding/onboarding.controller.ts": { kind: "open" },
  "onboarding/imports/imports.controller.ts": { kind: "open" },
  "users/invitations/invitations.controller.ts": { kind: "open" },
  "sales-reps/sales-reps.controller.ts": { kind: "open" },
  "messaging/whatsapp-webhook.controller.ts": { kind: "webhook" },
  "messaging/email-bounce.controller.ts": { kind: "webhook" },
  "messaging/public-appointment-reschedule.controller.ts": { kind: "open" },
  "operations/operations.controller.ts": { kind: "gated", entitlement: "mod_operations" },
  "patients/patients.controller.ts": { kind: "open" },
  "plans/platform-plans.controller.ts": { kind: "platform" },
  "plans/public-plans.controller.ts": { kind: "open" },
  "kiorex/platform-kiorex-rates.controller.ts": { kind: "platform" },
  "kiorex/platform-commission-disputes.controller.ts": { kind: "platform" },
  "kiorex/public-kiorex-fees.controller.ts": { kind: "open" },
  "kiorex/kiorex-billing-charges.controller.ts": { kind: "open" },
  "marketplace/marketplace.controller.ts": { kind: "webhook" },
  "marketplace/marketplace-org.controller.ts": { kind: "open" },
  "marketplace/marketplace-listings-profile.controller.ts": { kind: "open" },
  "marketplace/kiorex-settings.controller.ts": { kind: "open" },
  "marketplace/public-booking-page.controller.ts": { kind: "open" },
  "marketplace/record-share-clinic.controller.ts": { kind: "open" },
  "reports/reports.controller.ts": { kind: "gated", entitlement: "mod_reports" },
  "revenue/revenue.controller.ts": { kind: "gated", entitlement: "mod_revenue" },
  "scheduling/scheduling.controller.ts": { kind: "open" },
  "signup/public-signup.controller.ts": { kind: "open" },
  "support/support.controller.ts": { kind: "open" },
  "user-clinic-privilege-grants/user-clinic-privilege-grants.controller.ts": { kind: "open" },
  "user-money-visibility/user-money-visibility.controller.ts": { kind: "open" },
  "user-nav-tabs/tenant-role-nav-tabs.controller.ts": { kind: "open" },
  "user-nav-tabs/user-nav-tabs.controller.ts": { kind: "open" },
  "users/users.controller.ts": { kind: "open" },
  "usage/usage.controller.ts": { kind: "open" },
};

export const FEATURE_FLAG_ENTITLEMENT: Record<FeatureFlagKey, string> = {
  ai_assistant: "ai_assistant",
  whatsapp_reminders: "whatsapp_reminders",
  card_payments: "card_payments",
  instapay: "instapay",
  fawry: "fawry",
};

export const ENTITLEMENT_MIN_PLAN: Record<string, PlanKey> = {
  mod_clinical: PlanKey.PRO,
  mod_front_desk: PlanKey.PRO,
  mod_operations: PlanKey.CLINIC,
  mod_invoices: PlanKey.PRO,
  mod_revenue: PlanKey.PRO,
  mod_expenses: PlanKey.PRO,
  mod_hr: PlanKey.PRO,
  mod_payroll: PlanKey.CLINIC,
  mod_reports: PlanKey.PRO,
  mod_messaging: PlanKey.PRO,
  mod_integrations: PlanKey.CLINIC,
  mod_data_explorer: PlanKey.CLINIC,
  ai_assistant: PlanKey.PRO,
  ai_scribe: PlanKey.PRO,
  deposits: PlanKey.PRO,
  multi_branch: PlanKey.CLINIC,
  whatsapp_reminders: PlanKey.PRO,
  card_payments: PlanKey.PRO,
  instapay: PlanKey.PRO,
  fawry: PlanKey.PRO,
  dedicated_support: PlanKey.ENTERPRISE,
  pack_dental: PlanKey.PRO,
  pack_aesthetics: PlanKey.PRO,
  pack_physio: PlanKey.PRO,
  max_clinicians: PlanKey.PRO,
  max_branches: PlanKey.CLINIC,
  max_assistant_seats: PlanKey.PRO,
};

/** Sidebar tab → entitlement required (PL-06 presets). `profile` / core clinical tabs are not listed. */
export const NAV_TAB_ENTITLEMENT: Record<string, string> = {
  operations: "mod_operations",
  expenses: "mod_expenses",
  revenue: "mod_revenue",
  hr: "mod_hr",
  reports: "mod_reports",
  doctor_revenue: "mod_revenue",
};

/** PL-06 marketing nav presets (intersected with role/user grants on `/auth/me`). */
export const PLAN_NAV_TAB_PRESETS: Record<PlanKey, readonly string[]> = {
  [PlanKey.LITE]: [
    "dashboard",
    "appointments",
    "patients",
    "encounters",
    "revenue",
    "admin",
    "customer_support",
    "profile",
  ],
  [PlanKey.PRO]: [
    "dashboard",
    "appointments",
    "patients",
    "encounters",
    "revenue",
    "admin",
    "customer_support",
    "profile",
    "reports",
    "clinics",
    "expenses",
  ],
  [PlanKey.CLINIC]: [
    "dashboard",
    "appointments",
    "patients",
    "encounters",
    "revenue",
    "admin",
    "customer_support",
    "profile",
    "reports",
    "clinics",
    "expenses",
    "operations",
    "hr",
  ],
  [PlanKey.ENTERPRISE]: [
    "dashboard",
    "patients",
    "encounters",
    "appointments",
    "operations",
    "clinics",
    "expenses",
    "revenue",
    "hr",
    "reports",
    "customer_support",
    "admin",
    "doctor_revenue",
    "profile",
  ],
};

export const PLAN_MATRIX: Record<PlanKey, Record<string, EntitlementSeedValue>> = {
  [PlanKey.LITE]: {
    max_clinicians: 2,
    max_branches: 1,
    max_assistant_seats: 2,
    mod_clinical: false,
    mod_front_desk: false,
    mod_operations: false,
    mod_invoices: false,
    mod_revenue: true,
    mod_expenses: false,
    mod_hr: false,
    mod_payroll: false,
    mod_reports: false,
    mod_messaging: false,
    mod_integrations: false,
    mod_data_explorer: false,
    ai_assistant: false,
    ai_scribe: false,
    deposits: false,
    multi_branch: false,
    whatsapp_reminders: false,
    card_payments: false,
    instapay: false,
    fawry: false,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
  },
  [PlanKey.PRO]: {
    max_clinicians: 10,
    max_branches: 5,
    max_assistant_seats: 10,
    mod_clinical: true,
    mod_front_desk: true,
    mod_operations: false,
    mod_invoices: true,
    mod_revenue: true,
    mod_expenses: true,
    mod_hr: true,
    mod_payroll: false,
    mod_reports: true,
    mod_messaging: true,
    mod_integrations: false,
    mod_data_explorer: false,
    ai_assistant: true,
    /** Ambient scribe is a paid add-on — enable via tenant override / catalog add-on. */
    ai_scribe: false,
    deposits: true,
    multi_branch: false,
    whatsapp_reminders: true,
    card_payments: true,
    instapay: true,
    fawry: true,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
  },
  [PlanKey.CLINIC]: {
    max_clinicians: 50,
    max_branches: 25,
    max_assistant_seats: 30,
    mod_clinical: true,
    mod_front_desk: true,
    mod_operations: true,
    mod_invoices: true,
    mod_revenue: true,
    mod_expenses: true,
    mod_hr: true,
    mod_payroll: true,
    mod_reports: true,
    mod_messaging: true,
    mod_integrations: true,
    mod_data_explorer: true,
    ai_assistant: true,
    ai_scribe: true,
    deposits: true,
    multi_branch: true,
    whatsapp_reminders: true,
    card_payments: true,
    instapay: true,
    fawry: true,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
  },
  [PlanKey.ENTERPRISE]: {
    max_clinicians: -1,
    max_branches: -1,
    max_assistant_seats: -1,
    mod_clinical: true,
    mod_front_desk: true,
    mod_operations: true,
    mod_invoices: true,
    mod_revenue: true,
    mod_expenses: true,
    mod_hr: true,
    mod_payroll: true,
    mod_reports: true,
    mod_messaging: true,
    mod_integrations: true,
    mod_data_explorer: true,
    ai_assistant: true,
    ai_scribe: true,
    deposits: true,
    multi_branch: true,
    whatsapp_reminders: true,
    card_payments: true,
    instapay: true,
    fawry: true,
    dedicated_support: true,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
  },
};

/** CL-07 — specialty packs sold as billed add-ons (enable via tenant override after purchase). */
export const SPECIALTY_PACK_ADDONS = [
  { key: "pack_dental", nameEn: "Dental chart pack", nameAr: "باقة مخطط الأسنان", monthlyAmount: 299 },
  { key: "pack_aesthetics", nameEn: "Aesthetics before/after pack", nameAr: "باقة التجميل قبل/بعد", monthlyAmount: 249 },
  { key: "pack_physio", nameEn: "Physio treatment plans", nameAr: "خطط العلاج الطبيعي", monthlyAmount: 199 },
] as const;

export function planEntitlementRowsForSeed(): Record<PlanKey, Array<{ key: string; value: EntitlementSeedValue }>> {
  const out = {} as Record<PlanKey, Array<{ key: string; value: EntitlementSeedValue }>>;
  for (const plan of Object.values(PlanKey)) {
    const row = PLAN_MATRIX[plan];
    out[plan] = Object.keys(row)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ key, value: row[key]! }));
  }
  return out;
}

export function entitlementTruthyForNav(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return false;
}

export function filterNavTabsByEntitlements(
  tabKeys: string[],
  entitlements: Record<string, unknown> | undefined | null,
): string[] {
  if (!entitlements) return tabKeys;
  const out: string[] = [];
  for (const tab of tabKeys) {
    const required = NAV_TAB_ENTITLEMENT[tab];
    if (!required) {
      out.push(tab);
      continue;
    }
    if (entitlementTruthyForNav(entitlements[required])) out.push(tab);
  }
  return out;
}

/** Markdown table rows for Docs/PLANS_AND_ENTITLEMENTS.md section 02 (module × plan). */
export function matrixModulePlanMarkdownRows(): string[] {
  const moduleKeys = MODULE_ENTITLEMENT_KEYS.filter((k) => !k.startsWith("max_"));
  const plans = [PlanKey.LITE, PlanKey.PRO, PlanKey.CLINIC, PlanKey.ENTERPRISE];
  return moduleKeys.map((key) => {
    const cells = plans.map((p) => formatMarkdownCell(PLAN_MATRIX[p][key]));
    return `| \`${key}\` | ${cells.join(" | ")} |`;
  });
}

function formatMarkdownCell(value: EntitlementSeedValue | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value < 0 ? "Unlimited" : String(value);
  return "`object`";
}

export const PLAN_GATED_FEATURE_FLAGS: Partial<Record<FeatureFlagKey, string>> = FEATURE_FLAG_ENTITLEMENT;