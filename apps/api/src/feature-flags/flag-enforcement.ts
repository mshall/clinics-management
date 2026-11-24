/**
 * FF04 — where every Kiorly Clinic flag is enforced when OFF. Verified by `ff04-feature-guard.node.test.ts`
 * (the referenced file must contain the key next to a flag check) and mirrored in Docs/FEATURE_FLAGS.md.
 * `pending` = capability not built yet (KCV203/KCV204); the flag is registered so the control plane can pre-stage it.
 */
export type FlagEnforcement =
  | { kind: "controller"; files: readonly string[] }
  | { kind: "service"; files: readonly string[] }
  | { kind: "pending"; note: string };

export const FLAG_ENFORCEMENT: Record<string, FlagEnforcement> = {
  "clinic.kiorex_listing": {
    kind: "controller",
    files: ["marketplace/marketplace-listings-profile.controller.ts", "marketplace/marketplace-listing.service.ts"],
  },
  "clinic.commission_settlement": { kind: "service", files: ["kiorex/commission-charge.service.ts"] },
  "clinic.kiorly_pay_deposits": { kind: "controller", files: ["appointments/deposit-links.controller.ts"] },
  whatsapp_reminders: { kind: "service", files: ["messaging/appointment-reminder.scheduler.ts"] },
  "clinic.whatsapp_inbound": { kind: "service", files: ["messaging/whatsapp-inbound-replies.service.ts"] },
  instapay: { kind: "service", files: ["common/market-transfer-context.ts"] },
  fawry: { kind: "service", files: ["common/market-transfer-context.ts"] },
  card_payments: { kind: "controller", files: ["billing/billing.controller.ts"] },
  ai_assistant: { kind: "controller", files: ["assistant/assistant.controller.ts"] },
  "clinic.ai_scribe": { kind: "controller", files: ["clinic-ai/clinic-ai.controller.ts"] },
  "clinic.whatsapp_ai_receptionist": { kind: "service", files: ["messaging/whatsapp-ai-receptionist.service.ts"] },
  "clinic.no_show_risk": { kind: "controller", files: ["clinic-ai/clinic-ai.controller.ts"] },
  "clinic.waitlist_autofill": { kind: "service", files: ["messaging/waitlist-autofill.service.ts"] },
  "clinic.record_share_patient_app": {
    kind: "controller",
    files: ["marketplace/record-share-clinic.controller.ts", "marketplace/record-share.service.ts"],
  },
  "clinic.eprescription_handoff": { kind: "controller", files: ["clinical/rx-share.controller.ts"] },
  "clinic.lab_order_handoff": { kind: "controller", files: ["clinical/clinical.controller.ts", "nurse/lab-sample.service.ts"] },
  "clinic.payers_tpa": { kind: "controller", files: ["billing/claims.controller.ts"] },
  "clinic.specialty_templates.<code>": { kind: "controller", files: ["clinical/clinical.controller.ts"] },
  "clinic.referral_rewards": {
    kind: "service",
    files: ["growth/referral-attribution.service.ts", "growth/growth-referral.service.ts", "growth/referral-reward.service.ts"],
  },
  "clinic.field_rep_onboarding": { kind: "controller", files: ["signup/public-signup.controller.ts"] },
  "clinic.profession.physiotherapy": { kind: "service", files: ["clinician-verification/clinician-verification.service.ts"] },
  "clinic.home_visits": {
    kind: "controller",
    files: ["home-visits/home-visits.controller.ts", "home-visits/home-visit.service.ts", "home-visits/home-visit-config.service.ts"],
  },
  "clinic.home_route_view": { kind: "service", files: ["home-visits/home-visit-config.service.ts", "home-visits/home-visit.service.ts"] },
  "clinic.home_dispatch": { kind: "service", files: ["home-visits/home-visit-config.service.ts", "home-visits/home-visit.service.ts"] },
  "telehealth.video": { kind: "service", files: ["telehealth/telehealth-availability.ts", "telehealth/telehealth.service.ts"] },
  "nurse.edition": { kind: "service", files: ["nurse/nurse-edition.service.ts"] },
  "nurse.individual_tenants": { kind: "service", files: ["nurse/nurse-edition.service.ts"] },
  "nurse.care_plans": { kind: "service", files: ["nurse/care-plan.service.ts"] },
  "nurse.mar": { kind: "controller", files: ["nurse/nurse-mar.controller.ts"] },
  "nurse.private_duty_shifts": { kind: "service", files: ["nurse/shift.service.ts"] },
  "nurse.family_updates": { kind: "service", files: ["nurse/family-update.service.ts"] },
  "growth.provider_links": { kind: "controller", files: ["growth/provider-links/provider-links.controller.ts", "mobile/growth-mobile.controller.ts"] },
  "growth.provider_marketing_v2": { kind: "controller", files: ["growth/provider-marketing/provider-marketing.controller.ts", "mobile/growth-marketing-mobile.controller.ts"] },
  "clinic.provider_credit_v2": { kind: "controller", files: ["credits/credits.controller.ts", "credits/credit-fee-drawdown.service.ts", "credits/credit-grants.service.ts", "credits/credit-promotion-hold.service.ts"] },
  "clinic.usage_bundles": { kind: "service", files: ["credits/usage-bundles/usage-bundle.service.ts"] },
  "nurse.individual_kiorex_listing": { kind: "service", files: ["marketplace/marketplace-listing-eligibility.ts"] },
};
