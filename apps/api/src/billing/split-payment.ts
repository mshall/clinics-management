import { PaymentMethod, VisitCollectionMode } from "@prisma/client";
import { roundMoney } from "./patient-money";

export type SplitAllocationInput = { method: string; amount: number; reference?: string | null; channel?: string | null };
export type SplitAllocation = { method: PaymentMethod; amount: number; reference: string | null; channel: string | null };

/** Methods the desk can split across; Kiorex Pay is collected by Kiorex, never at the desk. */
export const DESK_SPLIT_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.TRANSFER,
  PaymentMethod.WALLET,
  PaymentMethod.OTHER,
];

export class SplitPaymentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Validates and normalizes allocations: positive amounts, desk methods only, rounded to cents. */
export function normalizeAllocations(input: SplitAllocationInput[] | undefined): { allocations: SplitAllocation[]; total: number } {
  if (!Array.isArray(input) || !input.length) throw new SplitPaymentError("ALLOCATIONS_REQUIRED", "Add at least one payment method");
  const allocations = input.map((a) => {
    const method = String(a?.method ?? "").toUpperCase() as PaymentMethod;
    if (!DESK_SPLIT_METHODS.includes(method)) throw new SplitPaymentError("METHOD_NOT_ALLOWED", `Method ${a?.method} cannot be used at the desk`);
    const amount = roundMoney(Number(a.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new SplitPaymentError("AMOUNT_INVALID", "Each part must be a positive amount");
    return { method, amount, reference: a.reference?.trim() || null, channel: a.channel?.trim().toUpperCase() || null };
  });
  return { allocations, total: roundMoney(allocations.reduce((s, a) => s + a.amount, 0)) };
}

/** Revenue collection fields for one allocation (transfers / wallets are money transfers; the rest are at the desk). */
export function collectionForAllocation(a: SplitAllocation): {
  collectionMode: VisitCollectionMode;
  transferChannel: string | null;
  transferReference: string | null;
} {
  if (a.method === PaymentMethod.TRANSFER || a.method === PaymentMethod.WALLET) {
    return { collectionMode: VisitCollectionMode.MONEY_TRANSFER, transferChannel: a.channel ?? a.method, transferReference: a.reference };
  }
  return { collectionMode: VisitCollectionMode.CASH_ON_VISIT, transferChannel: null, transferReference: a.reference };
}

export type InstallmentLike = { id: string; dueOn: Date; amount: number; paidAt: Date | null };

/**
 * Installments are settled oldest first, only when fully covered. What has been paid towards the open schedule is
 * (sum of unpaid installments − remaining balance); that works whatever was paid outside the schedule.
 */
export function installmentsSettled(installments: InstallmentLike[], remainingBalance: number): string[] {
  const unpaid = installments.filter((i) => !i.paidAt).sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
  const covered = roundMoney(unpaid.reduce((s, i) => s + i.amount, 0) - remainingBalance);
  const out: string[] = [];
  let cumulative = 0;
  for (const i of unpaid) {
    cumulative = roundMoney(cumulative + i.amount);
    if (cumulative > covered + 0.001) break;
    out.push(i.id);
  }
  return out;
}

export type InstallmentStatus = "PAID" | "OVERDUE" | "DUE_SOON" | "UPCOMING";

/** `today` and `dueOn` are calendar dates (YYYY-MM-DD) in the clinic's timezone. */
export function installmentStatus(dueOn: string, paidAt: Date | null, today: string, dueSoonDays: number): InstallmentStatus {
  if (paidAt) return "PAID";
  if (dueOn < today) return "OVERDUE";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + dueSoonDays);
  return dueOn <= soon.toISOString().slice(0, 10) ? "DUE_SOON" : "UPCOMING";
}

const DEFAULT_INSTALLMENT_REMINDER_DAYS = 2;

/** Market pack `providerConfig.billing.installmentReminderDaysBefore`. */
export function installmentReminderDaysBefore(providerConfig: unknown): number {
  const raw = (providerConfig as { billing?: { installmentReminderDaysBefore?: unknown } } | null)?.billing?.installmentReminderDaysBefore;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 30 ? n : DEFAULT_INSTALLMENT_REMINDER_DAYS;
}

/** Calendar date of an instant in a timezone. */
export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
