import { SubscriptionStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole, isTenantOwnerPrincipal } from "../common/effective-roles";

/** Action classes enforced by SubscriptionAccessGuard (SB-03). */
export const SubscriptionAccessAction = {
  READ: "READ",
  CLINICAL_WRITE: "CLINICAL_WRITE",
  SCHEDULING_WRITE: "SCHEDULING_WRITE",
  KIOREX_BOOKING: "KIOREX_BOOKING",
  BILLING: "BILLING",
  ADMIN: "ADMIN",
  EXPORT: "EXPORT",
} as const;

export type SubscriptionAccessAction =
  (typeof SubscriptionAccessAction)[keyof typeof SubscriptionAccessAction];

const FULL_ACCESS_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.GRACE,
]);

export function subscriptionAllowsAction(
  status: SubscriptionStatus,
  action: SubscriptionAccessAction,
  user?: JwtUser | null,
): boolean {
  if (FULL_ACCESS_STATUSES.has(status)) return true;

  if (status === SubscriptionStatus.READ_ONLY) {
    if (action === SubscriptionAccessAction.READ) return true;
    if (action === SubscriptionAccessAction.EXPORT) return true;
    if (
      action === SubscriptionAccessAction.BILLING &&
      user &&
      (isTenantOwnerPrincipal(user) || hasRole(user, UserRole.GROUP_ADMIN) || hasRole(user, UserRole.FINANCE_OFFICER))
    ) {
      return true;
    }
    return false;
  }

  if (status === SubscriptionStatus.SUSPENDED) {
    const owner = user ? isTenantOwnerPrincipal(user) : false;
    if (!owner) return false;
    if (action === SubscriptionAccessAction.READ) return true;
    if (action === SubscriptionAccessAction.EXPORT) return true;
    if (action === SubscriptionAccessAction.BILLING) return true;
    return false;
  }

  if (status === SubscriptionStatus.CANCELLED) {
    return action === SubscriptionAccessAction.READ || action === SubscriptionAccessAction.EXPORT;
  }

  return action === SubscriptionAccessAction.READ;
}

/**
 * The Kiorex listing pauses only with the subscription state (READ_ONLY / SUSPENDED). An unpaid Kiorex commission never pauses or hides
 * the listing (SB-05, decided 26 Nov 2026): collection of commission is separate from visibility.
 */
export function kiorexMarketplacePaused(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.READ_ONLY || status === SubscriptionStatus.SUSPENDED;
}