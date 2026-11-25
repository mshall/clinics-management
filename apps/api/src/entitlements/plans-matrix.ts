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
  /** ADR-039 telehealth (P2P WebRTC): ON for every plan for now; flip per plan here (no code change elsewhere). */
  "telehealth_video",
  "multi_branch",
  "whatsapp_reminders",
  "card_payments",
  "instapay",
  "fawry",
  "dedicated_support",
  "pack_dental",
  "pack_aesthetics",
  "pack_physio",
  /** Rev 2.3 home visits: booking/execution/safety are in EVERY tier (P5); route view + dispatch are tiered (KX-05 plans table). */
  "home_route_view",
  "home_dispatch",
  /** KX-23 §05 Nurse edition (only true on the NURSE_* plans and Enterprise). */
  "nurse_family_updates",
  "nurse_private_duty_shifts",
  /** KNLAB01: sample collection against a lab order handed to Kiorly Lab (Nurse Pro and above). */
  "nurse_lab_samples",
  "nurse_agency",
  /** Kiorly staff mobile app (commercial entitlement, NOT a safety control: the safety-alert inbox works on every plan). */
  "mobile_staff_app",
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
  /** Kiorly: gated by MobileInterceptor (`mobile_staff_app`), with the ADR-025 safety-alert routes open on every plan. */
  "mobile/mobile.controller.ts": { kind: "open" },
  "mobile/growth-marketing-mobile.controller.ts": { kind: "open" }, // GRW-P2-C: same /mobile/* plan gate; Growth module scoping and doctor-own-profile rule in the service
  "growth/provider-marketing/provider-marketing.controller.ts": { kind: "open" }, // GRW-P2-C: growth.provider_marketing_v2 on the new actions; Growth role matrix in the services
  "marketplace/marketplace-provider-verification.controller.ts": { kind: "webhook" }, // GRW-P2-C: HMAC marketplace client (Kiorex ops reads a request and delivers the decision)
  "mobile/growth-mobile.controller.ts": { kind: "open" }, // /mobile/* is plan-gated by MobilePlanGuard (mobile_staff_app); the module key clinic.growth scopes roles
  "admin/admin.controller.ts": { kind: "open" },
  "admin/data-explorer/admin-data-explorer.controller.ts": { kind: "gated", entitlement: "mod_data_explorer" },
  /** Token download only (no JWT); token proves access to a READY org backup artifact. */
  "admin/data-explorer/org-backup-download.controller.ts": { kind: "open" },
  "appointments/appointments.controller.ts": { kind: "open" },
  "appointments/deposit-links.controller.ts": { kind: "gated", entitlement: "deposits" },
  "appointments/public-deposit-link.controller.ts": { kind: "open" },
  "assistant/assistant.controller.ts": { kind: "gated", entitlement: "ai_assistant" },
  "auth/auth.controller.ts": { kind: "open" },
  "auth/kiorex-oidc.controller.ts": { kind: "open" },
  "billing/billing.controller.ts": { kind: "open" },
  "billing/patient-money.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "billing/cashier-shifts.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "billing/split-payments.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "kiorex/commission-collections.controller.ts": { kind: "open" }, // COM-1: provider-side commission transparency; access is decided by the finance/owner/admin rule of CommissionCollectionsService (GET /access), not by a plan entitlement
  "billing/pay/pay-collections.controller.ts": { kind: "open" }, // LG-INT-PAY-12..16: no plan entitlement today (role checks are in PayCollectionsService); gating it by plan is a pricing decision for the founder
  "billing/claims.controller.ts": { kind: "gated", entitlement: "mod_invoices" },
  "revenue-share/revenue-share.controller.ts": { kind: "gated", entitlement: "mod_revenue" },
  "dev-inbox/dev-inbox.controller.ts": { kind: "open" },
  "feature-flags/feature-flags.controller.ts": { kind: "open" },
  "scope-of-practice/scope-of-practice.controller.ts": { kind: "open" },
  "feature-flags/kiorex-flag-webhook.controller.ts": { kind: "webhook" },
  "growth/growth-referral.controller.ts": { kind: "open" },
  /** GRW-P1-D1: links work standalone (no Kiorex entitlement); plan limits are applied in the service (growth-plan-limits.ts). */
  "growth/provider-links/provider-links.controller.ts": { kind: "open" },
  "growth/b2b/b2b-referral.controller.ts": { kind: "open" }, // GRW-P4-C: growth.provider_marketing_v2 on send; Growth role matrix in the service; company data only
  "growth/b2b/b2b-mobile.controller.ts": { kind: "open" }, // GRW-P4-C: /mobile/* is plan-gated by MobilePlanGuard (mobile_staff_app)
  "growth/provider-links/public-link.controller.ts": { kind: "open" },
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
  "clinician-verification/profession.controller.ts": { kind: "open" },
  "clinical/physio.controller.ts": { kind: "mixed", entitlement: "pack_physio", minDecorators: 1 },
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
  "messaging/providers/provider-webhooks.controller.ts": { kind: "webhook" },
  "messaging/public-appointment-reschedule.controller.ts": { kind: "open" },
  "operations/operations.controller.ts": { kind: "gated", entitlement: "mod_operations" },
  "patients/patients.controller.ts": { kind: "open" },
  "plans/platform-plans.controller.ts": { kind: "platform" },
  "subscriptions/platform-subscriptions.controller.ts": { kind: "platform" },
  "plans/public-plans.controller.ts": { kind: "open" },
  "kiorex/platform-kiorex-rates.controller.ts": { kind: "platform" },
  "kiorex/platform-commission-disputes.controller.ts": { kind: "platform" },
  "kiorex/public-kiorex-fees.controller.ts": { kind: "open" },
  "kiorex/kiorex-billing-charges.controller.ts": { kind: "open" },
  "kiorex/commission-decisions.controller.ts": { kind: "open" },
  "marketplace/marketplace.controller.ts": { kind: "webhook" },
  "credits/credits.controller.ts": { kind: "open" }, // GRW-P2-W: gated by the flag clinic.provider_credit_v2 and the owner and finance roles in the controller
  "promotions/promotions.controller.ts": { kind: "open" }, // GRW-P2-S: gated by the flag clinic.provider_credit_v2 and the owner and admin roles in the controller
  "promotions/promotions-marketplace.controller.ts": { kind: "webhook" }, // GRW-P2-S: signed Kiorex commands (HMAC marketplace client)
  "marketplace/marketplace-referral-links.controller.ts": { kind: "webhook" }, // HMAC marketplace client (link registry lookup for Kiorex), same guard as marketplace.controller.ts
  "marketplace/marketplace-staff-phone-match.controller.ts": { kind: "webhook" }, // HMAC marketplace client (RF_PROVIDER_COLLUSION: keyed phone hashes in, one boolean out)
  "marketplace/kiorex-import.controller.ts": { kind: "webhook" },
  "marketplace/kiorex-connection.controller.ts": { kind: "webhook" },
  "marketplace/kiorex-connect.controller.ts": { kind: "open" },
  "marketplace/kiorex-front-door.controller.ts": { kind: "open" },
  "home-visits/home-visits.controller.ts": { kind: "open" },
  "home-visits/home-visit-internal.controller.ts": { kind: "webhook" },
  /** ADR-039: telehealth_video + telehealth.video are checked inside the service so already-scheduled visits stay reachable (flag OFF never hides data). */
  "telehealth/telehealth.controller.ts": { kind: "open" },
  "telehealth/telehealth-public.controller.ts": { kind: "open" },
  "telehealth/telehealth-internal.controller.ts": { kind: "webhook" },
  "nurse/nurse-edition.controller.ts": { kind: "open" },
  "nurse/nurse-clinical.controller.ts": { kind: "open" },
  "nurse/nurse-mar.controller.ts": { kind: "open" },
  "nurse/nurse-lab.controller.ts": { kind: "open" },
  "nurse/nurse-agency.controller.ts": { kind: "open" },
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
  "users/user-preferences.controller.ts": { kind: "open" },
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
  telehealth_video: PlanKey.LITE,
  multi_branch: PlanKey.CLINIC,
  whatsapp_reminders: PlanKey.PRO,
  card_payments: PlanKey.PRO,
  instapay: PlanKey.PRO,
  fawry: PlanKey.PRO,
  dedicated_support: PlanKey.ENTERPRISE,
  pack_dental: PlanKey.PRO,
  pack_aesthetics: PlanKey.PRO,
  pack_physio: PlanKey.LITE,
  home_route_view: PlanKey.PRO,
  home_dispatch: PlanKey.CLINIC,
  nurse_family_updates: PlanKey.NURSE_PRO,
  nurse_private_duty_shifts: PlanKey.NURSE_PRO,
  nurse_lab_samples: PlanKey.NURSE_PRO,
  nurse_agency: PlanKey.NURSE_AGENCY,
  mobile_staff_app: PlanKey.PRO,
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
    // mod_hr is true on Pro — sidebar must expose HR (was Clinic-only; admins lost the tab).
    "hr",
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
  /** Nurse edition (KX-23 §03): Today · Visits · Patients · Care plans · Payments · Reports · Settings (Team/Dispatch for agencies). Tab ids reuse the existing nav keys; labels are edition terminology in the web. */
  [PlanKey.NURSE_LITE]: ["dashboard", "appointments", "patients", "encounters", "revenue", "admin", "customer_support", "profile"],
  [PlanKey.NURSE_PRO]: ["dashboard", "appointments", "patients", "encounters", "revenue", "reports", "admin", "customer_support", "profile"],
  [PlanKey.NURSE_AGENCY]: ["dashboard", "appointments", "patients", "encounters", "revenue", "reports", "hr", "admin", "customer_support", "profile"],
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

export const PLAN_MATRIX = {
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
    telehealth_video: true,
    multi_branch: false,
    whatsapp_reminders: false,
    card_payments: false,
    instapay: false,
    fawry: false,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
    home_route_view: false,
    home_dispatch: false,
    nurse_family_updates: false,
    nurse_private_duty_shifts: false,
    nurse_lab_samples: false,
    nurse_agency: false,
    mobile_staff_app: false,
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
    telehealth_video: true,
    multi_branch: false,
    whatsapp_reminders: true,
    card_payments: true,
    instapay: true,
    fawry: true,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
    home_route_view: true,
    home_dispatch: false,
    nurse_family_updates: false,
    nurse_private_duty_shifts: false,
    nurse_lab_samples: false,
    nurse_agency: false,
    mobile_staff_app: true,
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
    telehealth_video: true,
    multi_branch: true,
    whatsapp_reminders: true,
    card_payments: true,
    instapay: true,
    fawry: true,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
    home_route_view: true,
    home_dispatch: true,
    nurse_family_updates: false,
    nurse_private_duty_shifts: false,
    nurse_lab_samples: false,
    nurse_agency: false,
    mobile_staff_app: true,
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
    telehealth_video: true,
    multi_branch: true,
    whatsapp_reminders: true,
    card_payments: true,
    instapay: true,
    fawry: true,
    dedicated_support: true,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: true,
    home_route_view: true,
    home_dispatch: true,
    nurse_family_updates: true,
    nurse_private_duty_shifts: true,
    nurse_lab_samples: true,
    nurse_agency: true,
    mobile_staff_app: true,
  },
} as unknown as Record<PlanKey, Record<string, EntitlementSeedValue>>;

/** Nurse edition plans (KX-23 §05). Seat limits: Lite/Pro = one nurse; Agency = 10 included (+ per extra nurse). */
function nursePlan(over: Record<string, EntitlementSeedValue>): Record<string, EntitlementSeedValue> {
  return {
    max_clinicians: 1,
    max_branches: 1,
    max_assistant_seats: 2,
    mod_clinical: true,
    mod_front_desk: true,
    mod_operations: false,
    mod_invoices: true,
    mod_revenue: true,
    mod_expenses: false,
    mod_hr: false,
    mod_payroll: false,
    mod_reports: true,
    mod_messaging: false,
    mod_integrations: false,
    mod_data_explorer: false,
    ai_assistant: false,
    ai_scribe: false,
    deposits: true,
    telehealth_video: true,
    multi_branch: false,
    whatsapp_reminders: false,
    card_payments: false,
    instapay: false,
    fawry: false,
    dedicated_support: false,
    pack_dental: false,
    pack_aesthetics: false,
    pack_physio: false,
    home_route_view: false,
    home_dispatch: false,
    nurse_family_updates: false,
    nurse_private_duty_shifts: false,
    nurse_lab_samples: false,
    nurse_agency: false,
    mobile_staff_app: false,
    ...over,
  };
}

PLAN_MATRIX[PlanKey.NURSE_LITE] = nursePlan({});
PLAN_MATRIX[PlanKey.NURSE_PRO] = nursePlan({
  home_route_view: true,
  whatsapp_reminders: true,
  card_payments: true,
  instapay: true,
  fawry: true,
  mod_messaging: true,
  nurse_family_updates: true,
  nurse_private_duty_shifts: true,
  mobile_staff_app: true,
  nurse_lab_samples: true,
});
PLAN_MATRIX[PlanKey.NURSE_AGENCY] = nursePlan({
  max_clinicians: 10,
  max_branches: 5,
  max_assistant_seats: 30,
  multi_branch: true,
  home_route_view: true,
  home_dispatch: true,
  whatsapp_reminders: true,
  card_payments: true,
  instapay: true,
  fawry: true,
  mod_messaging: true,
  mod_expenses: true,
  mod_hr: true,
  mod_payroll: true,
  nurse_family_updates: true,
  nurse_private_duty_shifts: true,
  nurse_lab_samples: true,
  nurse_agency: true,
  mobile_staff_app: true,
});

/** CL-07 — specialty packs sold as billed add-ons (enable via tenant override after purchase). */
export const SPECIALTY_PACK_ADDONS = [
  { key: "pack_dental", nameEn: "Dental chart pack", nameAr: "باقة مخطط الأسنان", monthlyAmount: 299 },
  { key: "pack_aesthetics", nameEn: "Aesthetics before/after pack", nameAr: "باقة التجميل قبل/بعد", monthlyAmount: 249 },
  {
    key: "pack_physio",
    nameEn: "Physiotherapy pack",
    nameAr: "باقة العلاج الطبيعي",
    /** PROPOSED (KX-05 Rev 2.3 §07, KX-12): EGP 300 / org / month. NEEDS_HUMAN: pricing owner confirms before any billing. */
    monthlyAmount: 300,
    currency: "EGP",
    priceStatus: "PROPOSED",
    needsHuman: "NEEDS_HUMAN",
    /** Plans on which it is an add-on; Enterprise includes it. */
    addOnFor: ["LITE", "PRO", "CLINIC"],
    includedIn: ["ENTERPRISE"],
    /** Template flag (launch-locked, gate GPR2: never recorded by code). */
    flagKey: "clinic.specialty_templates.physio",
  },
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