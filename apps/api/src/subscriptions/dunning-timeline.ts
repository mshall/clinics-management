import { SubscriptionStatus } from "@prisma/client";
import type { DunningTimelineConfig } from "./dunning-config";

const MS_DAY = 86_400_000;

/** Whole days after invoice due instant (UTC calendar). */
export function daysAfterDue(dueAt: Date, now: Date): number {
  const dueStart = Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), dueAt.getUTCDate());
  const nowStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((nowStart - dueStart) / MS_DAY);
}

/** Whole days before due (positive = future). */
export function daysBeforeDue(dueAt: Date, now: Date): number {
  return -daysAfterDue(dueAt, now);
}

export type DunningPhase =
  | "CURRENT"
  | "REMINDER"
  | "PAST_DUE"
  | "GRACE"
  | "READ_ONLY"
  | "SUSPENDED";

export function resolveDunningPhase(daysOverdue: number, config: DunningTimelineConfig): DunningPhase {
  if (daysOverdue < config.pastDueFromDay) return "CURRENT";
  if (daysOverdue <= config.graceEndDay) {
    return daysOverdue === config.pastDueFromDay ? "PAST_DUE" : "GRACE";
  }
  if (daysOverdue < config.suspendedFromDay) return "READ_ONLY";
  return "SUSPENDED";
}

/** Subscription status driven by days overdue on the oldest unpaid SaaS invoice. */
export function subscriptionStatusForDaysOverdue(
  daysOverdue: number,
  config: DunningTimelineConfig,
): SubscriptionStatus | null {
  if (daysOverdue < config.pastDueFromDay) return SubscriptionStatus.ACTIVE;
  if (daysOverdue <= config.graceEndDay) {
    return daysOverdue === config.pastDueFromDay ? SubscriptionStatus.PAST_DUE : SubscriptionStatus.GRACE;
  }
  if (daysOverdue < config.suspendedFromDay) return SubscriptionStatus.READ_ONLY;
  return SubscriptionStatus.SUSPENDED;
}

/** Reminders due today: `before` offset n fires when the due date is n days away; `after` offset m fires m days after the due date. */
export function dueReminderOffsets(
  config: Pick<DunningTimelineConfig, "reminderDaysBeforeDue" | "reminderDaysAfterDue">,
  dueAt: Date,
  now: Date,
): Array<{ direction: "BEFORE" | "AFTER"; offset: number; key: string }> {
  const out: Array<{ direction: "BEFORE" | "AFTER"; offset: number; key: string }> = [];
  const until = daysBeforeDue(dueAt, now);
  for (const offset of config.reminderDaysBeforeDue) {
    if (until === offset) out.push({ direction: "BEFORE", offset, key: `dunning_reminder_d${offset}` });
  }
  const after = daysAfterDue(dueAt, now);
  for (const offset of config.reminderDaysAfterDue) {
    if (offset >= 1 && after === offset) out.push({ direction: "AFTER", offset, key: `dunning_reminder_after_d${offset}` });
  }
  return out;
}
