/** Kiorex / marketplace outbox event types (KX-05). */
export const OUTBOX_EVENT = {
  APPOINTMENT_CONFIRMED: "APPOINTMENT_CONFIRMED",
  APPOINTMENT_RESCHEDULED: "RESCHEDULED",
  CANCELLED_BY_CLINIC: "CANCELLED_BY_CLINIC",
  CANCELLED_BY_PATIENT: "CANCELLED_BY_PATIENT",
  CHECKED_IN: "CHECKED_IN",
  CHECK_IN_REVERTED: "CHECK_IN_REVERTED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
  PROVIDER_PROFILE_UPDATED: "PROVIDER_PROFILE_UPDATED",
  LISTING_STATUS_CHANGED: "LISTING_STATUS_CHANGED",
  SLOTS_CHANGED: "SLOTS_CHANGED",
  COMMISSION_CHARGE_CREATED: "COMMISSION_CHARGE_CREATED",
  COMMISSION_CHARGE_REVERSED: "COMMISSION_CHARGE_REVERSED",
  REVIEW_INVITATION_ELIGIBLE: "REVIEW_INVITATION_ELIGIBLE",
  REVIEW_REPLY_POSTED: "REVIEW_REPLY_POSTED",
  /** KX-11 — signed visit summary pushed to Kiorex patient app when consented. */
  VISIT_SUMMARY_SHARED: "VISIT_SUMMARY_SHARED",
  PRESCRIPTION_SHARED: "PRESCRIPTION_SHARED",
  RECORD_SHARE_REVOKED: "RECORD_SHARE_REVOKED",
  /** KCV203 — e-prescription handed off to Kiorly Pharmacy via Kiorex (patient consent token required, KX-09 §04). */
  PRESCRIPTION_ISSUED: "PrescriptionIssued",
  /** KCV204 — lab order handed off to Kiorly Lab via Kiorex (patient consent token required). */
  LAB_ORDER_PLACED: "LabOrderPlaced",
  /** KX waitlist — a slot opened for a Kiorex-sourced waitlist entry; Kiorex offers it to the patient. */
  WAITLIST_OFFER: "WAITLIST_OFFER",
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT)[keyof typeof OUTBOX_EVENT];

export const OUTBOX_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
  DEAD: "DEAD",
} as const;

export const OUTBOX_TARGET_KIOREX = "KIOREX";
/** In-app / legacy topics not dispatched to HTTP (front desk, billing). */
export const OUTBOX_TARGET_INTERNAL = "INTERNAL";

export function isDispatchableOutboxTarget(target: string): boolean {
  return target === OUTBOX_TARGET_KIOREX || target.startsWith("TENANT_WEBHOOK:");
}

export function outboxTargetTenantWebhook(webhookId: string): string {
  return `TENANT_WEBHOOK:${webhookId}`;
}

export const OUTBOX_DISPATCH_MAX_ATTEMPTS = 8;
export const OUTBOX_LAG_ALERT_MS = 2 * 60 * 1000;