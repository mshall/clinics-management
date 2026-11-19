import { type Prisma, UserRole } from "@prisma/client";
import { hasAnyRole, isTenantOwnerPrincipal, type RolePrincipal } from "../common/effective-roles";

export const REFUND_STATUS = {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
} as const;

export const DEPOSIT_STATUS = {
  PENDING: "PENDING",
  HELD: "HELD",
  APPLIED: "APPLIED",
  RELEASED: "RELEASED",
  FORFEITED: "FORFEITED",
  /** FS-04 — payment link ran out unpaid. */
  EXPIRED: "EXPIRED",
  /** FS-04 — payment link voided (appointment ended or replaced) before it was paid. */
  CANCELLED: "CANCELLED",
} as const;

export const PACKAGE_STATUS = {
  ACTIVE: "ACTIVE",
  EXHAUSTED: "EXHAUSTED",
  CANCELLED: "CANCELLED",
} as const;

export const REFUND_REVENUE_CATEGORY = "REFUND";
export const PACKAGE_SESSION_REVENUE_CATEGORY = "PACKAGE_SESSION";
export const DEPOSIT_APPLIED_REVENUE_CATEGORY = "DEPOSIT_APPLIED";

const DEFAULT_REFUND_APPROVAL_THRESHOLD = 1000;

/** Market pack `providerConfig.billing.refundApprovalThreshold` (major units); refunds above it need an approver. */
export function refundApprovalThreshold(providerConfig: unknown): number {
  const raw = (providerConfig as { billing?: { refundApprovalThreshold?: unknown } } | null)?.billing
    ?.refundApprovalThreshold;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REFUND_APPROVAL_THRESHOLD;
}

const REFUND_APPROVER_ROLES = [
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.FINANCE_OFFICER,
  UserRole.BRANCH_MANAGER,
] as const;

const MONEY_DESK_ROLES = [...REFUND_APPROVER_ROLES, UserRole.RECEPTIONIST, UserRole.CLINIC_ASSISTANT] as const;

export function canApproveRefunds(principal: RolePrincipal): boolean {
  return isTenantOwnerPrincipal(principal) || hasAnyRole(principal, REFUND_APPROVER_ROLES);
}

export function canHandlePatientMoney(principal: RolePrincipal): boolean {
  return isTenantOwnerPrincipal(principal) || hasAnyRole(principal, MONEY_DESK_ROLES);
}

/** A refund completes immediately when it is at/below the threshold or the requester can approve it. */
export function refundNeedsApproval(amount: number, threshold: number, requesterCanApprove: boolean): boolean {
  return !requesterCanApprove && amount > threshold;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Remaining refundable amount: original minus refunds that are completed or still waiting for approval. */
export function refundableRemaining(original: number, priorRefunds: { amount: number; status: string }[]): number {
  const used = priorRefunds
    .filter((r) => r.status !== REFUND_STATUS.REJECTED)
    .reduce((s, r) => s + r.amount, 0);
  return Math.max(0, roundMoney(original - used));
}

/**
 * Revenue recognised per consumed session. The last session takes the rounding remainder so the
 * package's sessions always sum to exactly what was paid.
 */
export function packageSessionValue(paidAmount: number, totalSessions: number, sessionsRemaining: number): number {
  if (totalSessions <= 0 || sessionsRemaining <= 0) return 0;
  const per = roundMoney(paidAmount / totalSessions);
  if (sessionsRemaining === 1) {
    return roundMoney(paidAmount - per * (totalSessions - 1));
  }
  return per;
}

export function isPackageExpired(expiresOn: Date | null, now: Date = new Date()): boolean {
  if (!expiresOn) return false;
  const end = new Date(expiresOn);
  end.setUTCHours(23, 59, 59, 999);
  return end.getTime() < now.getTime();
}

/** Signed drawer effect of a cash movement (IN adds, OUT subtracts). */
export function signedMovement(direction: string, amount: number): number {
  return direction === "OUT" ? -amount : amount;
}

/** Serialises concurrent money writes on one key (refunds against a payment, package use, deposit settlement). */
export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
