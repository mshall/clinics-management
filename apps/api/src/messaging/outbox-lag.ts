import { OUTBOX_LAG_ALERT_MS, OUTBOX_STATUS } from "./outbox-event-types";

export function outboxPendingLagExceedsAlert(oldestPendingCreatedAt: Date | null, now = new Date()): boolean {
  if (!oldestPendingCreatedAt) return false;
  return now.getTime() - oldestPendingCreatedAt.getTime() > OUTBOX_LAG_ALERT_MS;
}

export function outboxPendingLagMs(oldestPendingCreatedAt: Date | null, now = new Date()): number | null {
  if (!oldestPendingCreatedAt) return null;
  return now.getTime() - oldestPendingCreatedAt.getTime();
}

export { OUTBOX_STATUS };