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
  "clinic.lab_order_handoff": { kind: "controller", files: ["clinical/clinical.controller.ts"] },
  "clinic.payers_tpa": { kind: "controller", files: ["billing/claims.controller.ts"] },
  "clinic.specialty_templates.<code>": { kind: "controller", files: ["clinical/clinical.controller.ts"] },
  "clinic.referral_rewards": {
    kind: "service",
    files: ["growth/referral-attribution.service.ts", "growth/growth-referral.service.ts", "growth/referral-reward.service.ts"],
  },
  "clinic.field_rep_onboarding": { kind: "controller", files: ["signup/public-signup.controller.ts"] },
};
