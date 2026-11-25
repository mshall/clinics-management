import type { Prisma } from "@prisma/client";
import { resolvePolicy } from "./promotion-policy";

/**
 * GRW-P2-S commission basis (contracts 1.12.0: `feeBasisMinor`, `sponsoredDiscountMinor`, `basisPolicyVersion`). READ ONLY, so it is safe inside the check-in transaction. Only a booking that has a
 * sponsored reservation gets any of the three fields; every other decision is exactly what it was before this package. A sponsored promotion never changes chargeability or attribution: it only names the
 * basis the fee is computed on (default GROSS_BEFORE_SPONSORED: the fee before any sponsored discount; NET_AFTER_SPONSORED exists for a future percentage model).
 */
export interface SponsoredBasis { feeBasisMinor?: number; sponsoredDiscountMinor?: number; basisPolicyVersion?: string }
export function basisOf(i: { visitFeeMinor: number; sponsoredMinor: number; commissionBasis: "GROSS_BEFORE_SPONSORED" | "NET_AFTER_SPONSORED"; policyVersion: string }): SponsoredBasis {
  if (i.sponsoredMinor <= 0) return {};
  return { feeBasisMinor: i.commissionBasis === "NET_AFTER_SPONSORED" ? Math.max(0, i.visitFeeMinor - i.sponsoredMinor) : i.visitFeeMinor, sponsoredDiscountMinor: i.sponsoredMinor, basisPolicyVersion: i.policyVersion };
}
export async function loadSponsoredBasis(tx: Prisma.TransactionClient, tenantId: string, appointmentId: string, visitFee: number | string | Prisma.Decimal): Promise<SponsoredBasis> {
  const r = await tx.promotionReservation.findFirst({ where: { tenantId, appointmentId, state: { in: ["BOOKED", "DEBITED"] } }, select: { amountMinor: true } });
  if (!r) return {};
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
  const p = resolvePolicy(t?.market?.featureDefaults);
  return basisOf({ visitFeeMinor: Math.round(Number(visitFee) * 100), sponsoredMinor: r.amountMinor, commissionBasis: p.commissionBasis, policyVersion: p.policyVersion });
}
