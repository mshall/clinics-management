import { SubscriptionStatus } from "@prisma/client";

const ALLOWED: Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>> = {
  TRIALING: new Set([SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED]),
  ACTIVE: new Set([
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.ACTIVE,
  ]),
  PAST_DUE: new Set([
    SubscriptionStatus.GRACE,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.SUSPENDED,
  ]),
  GRACE: new Set([
    SubscriptionStatus.READ_ONLY,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.SUSPENDED,
  ]),
  READ_ONLY: new Set([SubscriptionStatus.SUSPENDED, SubscriptionStatus.ACTIVE]),
  SUSPENDED: new Set([SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED]),
  CANCELLED: new Set([SubscriptionStatus.CANCELLED]),
};

export function assertSubscriptionStatusTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED[from];
  if (!allowed?.has(to)) {
    throw new Error(`Invalid subscription status transition ${from} -> ${to}`);
  }
}