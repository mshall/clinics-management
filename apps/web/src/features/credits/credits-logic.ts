/** GRW-P2-W: pure helpers of the provider credit screens (no React). The server is the authority for every amount; this only shapes what it returns. */
export const CREDIT_USES = ["KIOREX_FEES", "SUBSCRIPTION", "USAGE", "PROMOTIONS", "MARKETING"] as const;
export type CreditUseKey = (typeof CREDIT_USES)[number];
export type CreditCategoryKey = "SERVICE_RECOVERY" | "ONBOARDING" | "PROMOTIONAL" | "REFERRAL" | "ADJUSTMENT";

export type WalletLot = { id: string; reason: string; category: CreditCategoryKey; remaining: string; expiresAt: string | null };
export type WalletEntry = { id: string; type: "GRANT" | "CONSUME" | "EXPIRE" | "REVERSE"; reason: string; amount: string; remaining: string | null; expiresAt: string | null; category: CreditCategoryKey | null; note: string | null; createdAt: string };
export type CreditWallet = {
  balance: string; currency: string; version: number;
  lots?: WalletLot[]; spendableByUse?: Record<CreditUseKey, string>; reserved?: string; canPayFor?: Record<CreditUseKey, boolean>;
  entries: WalletEntry[]; page: number; pageSize: number; total: number;
};
export type CreditSection = {
  periodKey: string; currency: string; opening: string; grantsByReason: Record<string, string>; grantsByCategory: Record<string, string>; returns: string;
  consumptionByUse: Record<string, string>; consumed: string; expiries: string; closing: string; reconciles: boolean; empty?: boolean;
};

/** Days until a lot expires (ceil, never negative), or null when it does not expire. */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

/** Lots sorted the way they are spent: first expiring first, no expiry last. */
export function lotsInSpendOrder(lots: WalletLot[]): WalletLot[] {
  return [...lots].sort((a, b) => (a.expiresAt && b.expiresAt ? a.expiresAt.localeCompare(b.expiresAt) || a.id.localeCompare(b.id) : a.expiresAt ? -1 : b.expiresAt ? 1 : a.id.localeCompare(b.id)));
}

/** Banner: credit about to lapse (soonest lot within `windowDays`), as an amount and a number of days. */
export function expiringSoon(lots: WalletLot[], windowDays = 30, now = Date.now()): { amount: number; days: number } | null {
  let amount = 0; let days = Infinity;
  for (const l of lots) {
    const d = daysUntil(l.expiresAt, now);
    if (d === null || d > windowDays || Number(l.remaining) <= 0) continue;
    amount += Number(l.remaining); days = Math.min(days, d);
  }
  return amount > 0 ? { amount: Math.round(amount * 100) / 100, days } : null;
}

export const categoryTone = (c: CreditCategoryKey): "neutral" | "info" | "success" => (c === "SERVICE_RECOVERY" ? "success" : c === "ADJUSTMENT" ? "neutral" : "info");

/** The last `n` calendar months as YYYY-MM, newest first (UTC, matches the server's billing period). */
export function recentMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
