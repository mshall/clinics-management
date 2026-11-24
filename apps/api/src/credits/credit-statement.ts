import { CreditEntryType, Prisma, type CreditCategory, type CreditReason } from "@prisma/client";
import { USE_OF_REASON, categoryOfReason, type CreditUse } from "./credit-categories";

/** GRW-P2-W: the Credit section of the monthly statement. Pure: numbers come from the ledger rows, nothing else. */
export type StatementLedgerRow = { type: CreditEntryType; reason: CreditReason; category?: CreditCategory | null; amount: Prisma.Decimal; createdAt: Date };

export type CreditSection = {
  opening: string;
  grantsByReason: Record<string, string>;
  grantsByCategory: Record<string, string>;
  /** Returns of money-like charges: dispute wins, late reversals, sponsored promotion reversals (also counted in grants). */
  returns: string;
  consumptionByUse: Record<string, string>;
  consumed: string;
  expiries: string;
  closing: string;
  /** reconciles to the ledger: opening + grants - consumption - expiries (+ explicit reverse rows) = closing */
  reconciles: boolean;
};

const ZERO = new Prisma.Decimal(0);
const RETURN_REASONS: CreditReason[] = ["DISPUTE_WIN", "KIOREX_LATE_REVERSAL", "SPONSORED_PROMOTION_REVERSAL"];

export function buildCreditSection(rows: StatementLedgerRow[], periodStart: Date, periodEnd: Date): CreditSection {
  let opening = ZERO;
  let closing = ZERO;
  let grants = ZERO;
  let consumed = ZERO;
  let expiries = ZERO;
  let reverse = ZERO;
  let returns = ZERO;
  const byReason: Record<string, Prisma.Decimal> = {};
  const byCategory: Record<string, Prisma.Decimal> = {};
  const byUse: Record<string, Prisma.Decimal> = {};
  for (const r of rows) {
    const t = r.createdAt.getTime();
    if (t < periodStart.getTime()) opening = opening.add(r.amount);
    if (t < periodEnd.getTime()) closing = closing.add(r.amount);
    if (t < periodStart.getTime() || t >= periodEnd.getTime()) continue;
    if (r.type === CreditEntryType.GRANT) {
      grants = grants.add(r.amount);
      byReason[r.reason] = (byReason[r.reason] ?? ZERO).add(r.amount);
      const cat = r.category ?? categoryOfReason(r.reason);
      byCategory[cat] = (byCategory[cat] ?? ZERO).add(r.amount);
      if (RETURN_REASONS.includes(r.reason)) returns = returns.add(r.amount);
    } else if (r.type === CreditEntryType.CONSUME) {
      const used = r.amount.neg();
      consumed = consumed.add(used);
      const use: CreditUse | "OTHER" = USE_OF_REASON[r.reason] ?? "OTHER";
      byUse[use] = (byUse[use] ?? ZERO).add(used);
    } else if (r.type === CreditEntryType.EXPIRE) {
      expiries = expiries.add(r.amount.neg());
    } else {
      reverse = reverse.add(r.amount);
    }
  }
  const fmt = (m: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.toFixed(2)]));
  const reconciles = opening.add(grants).sub(consumed).sub(expiries).add(reverse).equals(closing);
  return {
    opening: opening.toFixed(2),
    grantsByReason: fmt(byReason),
    grantsByCategory: fmt(byCategory),
    returns: returns.toFixed(2),
    consumptionByUse: fmt(byUse),
    consumed: consumed.toFixed(2),
    expiries: expiries.toFixed(2),
    closing: closing.toFixed(2),
    reconciles,
  };
}

export const CREDIT_LABELS = {
  en: { title: "Credit", opening: "Opening balance", grants: "Credit granted", returns: "Of which returned (dispute wins, reversals)", consumed: "Credit used", expiries: "Credit expired", closing: "Closing balance", uses: { KIOREX_FEES: "Kiorex fees", SUBSCRIPTION: "Subscription", USAGE: "Usage", PROMOTIONS: "Patient promotions you sponsored", MARKETING: "Marketing", OTHER: "Other" } },
  ar: { title: "الرصيد", opening: "الرصيد الافتتاحي", grants: "الرصيد الممنوح", returns: "منه مُعاد (كسب النزاعات والعكوس)", consumed: "الرصيد المستخدم", expiries: "الرصيد المنتهي", closing: "الرصيد الختامي", uses: { KIOREX_FEES: "رسوم كيوركس", SUBSCRIPTION: "الاشتراك", USAGE: "الاستخدام", PROMOTIONS: "خصومات المرضى التي ترعاها", MARKETING: "التسويق", OTHER: "أخرى" } },
} as const;
