/**
 * COM-3 tender of a commission claim (pure). Kiorex pays providers in Egypt by bank transfer only and never holds or pays cash; a commission on a cash-paid visit is accrued and netted in the
 * provider's next settlement. This product tells Kiorex how the visit was paid so the two sides show the same accrual:
 *   ONLINE  the visit (or its deposit) went through the Kiorex Pay layer (a HELD / APPLIED deposit paid by Kiorex Pay or a payment link, or a KIOREX_PAY allocation)
 *   CASH    the visit was paid at the clinic in cash (check-in collection mode CASH_ON_VISIT, or a CASH allocation)
 *   null    not reported: the payment is unknown, or it went straight to the clinic by another route (direct bank transfer, card terminal). Nothing is guessed.
 * Mixed visits count as ONLINE when any part went through the Pay layer (that part is in the payout Kiorex nets from).
 */
export type TenderFacts = {
  checkInCollectionMode?: string | null;
  deposits?: ReadonlyArray<{ method?: string | null; source?: string | null; status?: string | null }>;
  allocationMethods?: ReadonlyArray<string | null | undefined>;
};
export type CommissionTender = "CASH" | "ONLINE";
const LIVE_DEPOSIT = new Set(["HELD", "APPLIED"]);

export function commissionTender(f: TenderFacts): CommissionTender | null {
  const online = (f.deposits ?? []).some((d) => LIVE_DEPOSIT.has(String(d.status ?? "").toUpperCase()) && (String(d.method ?? "").toUpperCase() === "KIOREX_PAY" || ["KIOREX_PAY", "PAYMENT_LINK"].includes(String(d.source ?? "").toUpperCase())))
    || (f.allocationMethods ?? []).some((m) => String(m ?? "").toUpperCase() === "KIOREX_PAY");
  if (online) return "ONLINE";
  const cash = String(f.checkInCollectionMode ?? "").toUpperCase() === "CASH_ON_VISIT" || (f.allocationMethods ?? []).some((m) => String(m ?? "").toUpperCase() === "CASH");
  return cash ? "CASH" : null;
}
export const asTender = (v: unknown): CommissionTender | null => (typeof v === "string" && ["CASH", "ONLINE"].includes(v.toUpperCase()) ? (v.toUpperCase() as CommissionTender) : null);
