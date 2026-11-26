import { asTender, type CommissionTender } from "./commission-tender";

/**
 * COM-3 claim of a collection run as Kiorex pushes it (contracts 1.13.0 run push). The five additive fields (disputeStatus, disputeDeadline, tender, rateSource, rateSnapshot) are kept when valid
 * and read as null otherwise; unknown fields are dropped. Nothing here can make an old or a newer push fail.
 */
export type ClaimView = {
  chargeId: string; appointmentId?: string; amountMinor: number; collectedMinor?: number; collectionStatus?: string; chargeStatus?: string; decisionRef?: string | null; feeBasisMinor?: number | null;
  sponsoredDiscountMinor?: number | null; basisPolicyVersion?: string | null;
  disputeStatus: string | null; disputeDeadline: string | null; tender: CommissionTender | null; rateSource: string | null; rateSnapshot: Record<string, unknown> | null;
};
const str = (v: unknown, max = 120): string | undefined => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined);
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);
const iso = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const snapshot = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length <= 8000 ? (v as Record<string, unknown>) : null);

export function normalizeClaim(raw: unknown): ClaimView | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const chargeId = str(c.chargeId, 64);
  if (!chargeId) return null;
  return {
    chargeId, appointmentId: str(c.appointmentId, 64), amountMinor: int(c.amountMinor) ?? 0, collectedMinor: int(c.collectedMinor), collectionStatus: str(c.collectionStatus, 30), chargeStatus: str(c.chargeStatus, 30),
    decisionRef: str(c.decisionRef, 64) ?? null, feeBasisMinor: int(c.feeBasisMinor) ?? null, sponsoredDiscountMinor: int(c.sponsoredDiscountMinor) ?? null, basisPolicyVersion: str(c.basisPolicyVersion) ?? null,
    disputeStatus: str(c.disputeStatus, 20) ?? null, disputeDeadline: iso(c.disputeDeadline), tender: asTender(c.tender), rateSource: str(c.rateSource, 30) ?? null, rateSnapshot: snapshot(c.rateSnapshot),
  };
}
export const normalizeClaims = (raw: unknown): ClaimView[] => (Array.isArray(raw) ? raw.map(normalizeClaim).filter((c): c is ClaimView => c !== null) : []);
