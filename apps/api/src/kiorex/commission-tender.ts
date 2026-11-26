/**
 * COM-3 tender of a commission claim (pure). Kiorex pays providers in Egypt by bank transfer only and never holds or pays cash; a commission on a cash-paid visit is accrued and netted in the
 * provider's next settlement. This product tells Kiorex how the visit was paid so the two sides show the same accrual:
 *   ONLINE  the visit (or its deposit) went through the Kiorex Pay layer (a HELD / APPLIED deposit paid by Kiorex Pay or a payment link, or a KIOREX_PAY allocation)
 *   CASH    the visit was paid at the clinic in cash (check-in collection mode CASH_ON_VISIT, or a CASH allocation)
 *   null    not reported: the payment is unknown, or it went straight to the clinic by another route (direct bank transfer, card terminal). Nothing is guessed.
 *
 * LG-COM-20 (founder, 27 Nov 2026): a direct bank transfer, InstaPay transfer or card-terminal payment at the clinic is a CASH-TYPE tender (wire `tender` CASH: accrues and is netted in the next bank payout) AND its own
 * kind, `CASH_TRANSFER` ("cash transfer"), so Ops, providers and the statement tell it from plain cash. The wire tender stays CASH | ONLINE (contracts 1.13.0 unchanged); the kind travels as the additive optional
 * `tenderMethod` (CASH | CASH_TRANSFER) and `tenderDetail` (BANK_TRANSFER | INSTAPAY | CARD_TERMINAL). A payment method that is not one of these (an unknown channel, an unrecognised method) is NOT guessed: it stays null (not reported).
 * Mixed visits count as ONLINE when any part went through the Pay layer (that part is in the payout Kiorex nets from).
 */
export type TenderFacts = {
  checkInCollectionMode?: string | null;
  /** Market-defined channel id of a MONEY_TRANSFER check-in (INSTAPAY, a bank channel, a card terminal). */
  checkInTransferChannel?: string | null;
  deposits?: ReadonlyArray<{ method?: string | null; source?: string | null; status?: string | null }>;
  allocationMethods?: ReadonlyArray<string | null | undefined>;
};
export type CommissionTender = "CASH" | "ONLINE";
export type TenderMethod = "CASH" | "CASH_TRANSFER";
export type TenderDetail = "BANK_TRANSFER" | "INSTAPAY" | "CARD_TERMINAL";
export type TenderKind = { tender: CommissionTender; tenderMethod: TenderMethod | null; tenderDetail: TenderDetail | null };
export type TenderKindName = "ONLINE" | "CASH" | "CASH_TRANSFER";
const LIVE_DEPOSIT = new Set(["HELD", "APPLIED"]);

/** Detail of a direct transfer from a market channel id or a payment method code; null when it is not one of the three (never guessed: a wallet or an unknown channel stays unknown). */
export function transferDetailOf(v: string | null | undefined): TenderDetail | null {
  const x = String(v ?? "").trim().toUpperCase();
  if (!x) return null;
  if (x === "INSTAPAY" || x === "INSTA_PAY") return "INSTAPAY";
  if (x === "BANK_TRANSFER" || x === "BANK" || x === "TRANSFER" || x.startsWith("BANK_")) return "BANK_TRANSFER";
  if (x === "CARD_TERMINAL" || x === "POS" || x === "POS_TERMINAL" || x === "CARD") return "CARD_TERMINAL";
  return null;
}

/** Kind of the tender: ONLINE wins (that part went through the Pay layer); a direct transfer is CASH_TRANSFER, cash alone is CASH; anything else is null (not reported). */
export function commissionTenderKind(f: TenderFacts): TenderKind | null {
  if (commissionTender(f) === "ONLINE") return { tender: "ONLINE", tenderMethod: null, tenderDetail: null };
  const transfer = (f.allocationMethods ?? []).map((m) => (["CARD", "TRANSFER"].includes(String(m ?? "").toUpperCase()) ? transferDetailOf(String(m)) : null)).find((d) => d !== null)
    ?? (String(f.checkInCollectionMode ?? "").toUpperCase() === "MONEY_TRANSFER" ? transferDetailOf(f.checkInTransferChannel) : null);
  if (transfer) return { tender: "CASH", tenderMethod: "CASH_TRANSFER", tenderDetail: transfer };
  return commissionTender(f) === "CASH" ? { tender: "CASH", tenderMethod: "CASH", tenderDetail: null } : null;
}

export const asTenderMethod = (v: unknown): TenderMethod | null => (typeof v === "string" && ["CASH", "CASH_TRANSFER"].includes(v.toUpperCase()) ? (v.toUpperCase() as TenderMethod) : null);
export const asTenderDetail = (v: unknown): TenderDetail | null => (typeof v === "string" && ["BANK_TRANSFER", "INSTAPAY", "CARD_TERMINAL"].includes(v.toUpperCase()) ? (v.toUpperCase() as TenderDetail) : null);
/** The kind a charge falls under for pricing: ONLINE, CASH, CASH_TRANSFER, or null when the tender is not reported (the base rate applies). */
export const tenderKindName = (c: { tender?: string | null; tenderMethod?: string | null }): TenderKindName | null => (c.tender === "ONLINE" ? "ONLINE" : c.tender === "CASH" ? (c.tenderMethod === "CASH_TRANSFER" ? "CASH_TRANSFER" : "CASH") : null);

export function commissionTender(f: TenderFacts): CommissionTender | null {
  const online = (f.deposits ?? []).some((d) => LIVE_DEPOSIT.has(String(d.status ?? "").toUpperCase()) && (String(d.method ?? "").toUpperCase() === "KIOREX_PAY" || ["KIOREX_PAY", "PAYMENT_LINK"].includes(String(d.source ?? "").toUpperCase())))
    || (f.allocationMethods ?? []).some((m) => String(m ?? "").toUpperCase() === "KIOREX_PAY");
  if (online) return "ONLINE";
  const cash = String(f.checkInCollectionMode ?? "").toUpperCase() === "CASH_ON_VISIT" || (f.allocationMethods ?? []).some((m) => String(m ?? "").toUpperCase() === "CASH");
  if (cash) return "CASH";
  // LG-COM-20: a direct transfer / card terminal at the clinic is cash-type; an unknown channel stays null
  const direct = (String(f.checkInCollectionMode ?? "").toUpperCase() === "MONEY_TRANSFER" && transferDetailOf(f.checkInTransferChannel) !== null) || (f.allocationMethods ?? []).some((m) => ["CARD", "TRANSFER"].includes(String(m ?? "").toUpperCase()));
  return direct ? "CASH" : null;
}
export const asTender = (v: unknown): CommissionTender | null => (typeof v === "string" && ["CASH", "ONLINE"].includes(v.toUpperCase()) ? (v.toUpperCase() as CommissionTender) : null);
