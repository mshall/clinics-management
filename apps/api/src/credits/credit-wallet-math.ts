import { CreditEntryType, type CreditReason, Prisma } from "@prisma/client";

export type SimLedgerEntry = {
  type: CreditEntryType;
  reason: CreditReason;
  amount: Prisma.Decimal;
  remaining?: Prisma.Decimal | null;
  expiresAt?: Date | null;
};

export type GrantLot = {
  entryIndex: number;
  remaining: Prisma.Decimal;
  expiresAt: Date | null;
};

export function decimalAmount(v: number | string): Prisma.Decimal {
  return new Prisma.Decimal(String(v));
}

export function sumLedgerAmounts(entries: Pick<SimLedgerEntry, "amount">[]): Prisma.Decimal {
  return entries.reduce((acc, row) => acc.add(row.amount), new Prisma.Decimal(0));
}

/** GRANT lots still spendable at `at` (expired or fully consumed lots excluded). */
export function creditWalletSpendableAt(entries: SimLedgerEntry[], at: Date): number {
  const lots = grantLotsFromEntries(entries);
  let sum = 0;
  for (const lot of lots) {
    if (lot.expiresAt && lot.expiresAt.getTime() <= at.getTime()) continue;
    sum += Number(lot.remaining.toFixed(2));
  }
  return Math.round(sum * 100) / 100;
}

export function grantLotsFromEntries(entries: SimLedgerEntry[]): GrantLot[] {
  const lots: GrantLot[] = [];
  entries.forEach((e, entryIndex) => {
    if (e.type !== CreditEntryType.GRANT) return;
    const remaining = e.remaining ?? e.amount;
    if (remaining.lte(0)) return;
    lots.push({ entryIndex, remaining, expiresAt: e.expiresAt ?? null });
  });
  return lots;
}

/** Earliest expiry first; null expiry consumes last. */
export function sortGrantLotsFifo(lots: GrantLot[]): GrantLot[] {
  return [...lots].sort((a, b) => {
    if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime();
    if (a.expiresAt) return -1;
    if (b.expiresAt) return 1;
    return a.entryIndex - b.entryIndex;
  });
}

export type FifoAllocation = { entryIndex: number; taken: Prisma.Decimal };

/**
 * Allocate a positive consume amount across grant lots (FIFO). Throws if insufficient.
 */
export function allocateConsumeFifo(lots: GrantLot[], consumeAmount: Prisma.Decimal): FifoAllocation[] {
  if (consumeAmount.lte(0)) {
    throw new Error("consume amount must be positive");
  }
  const sorted = sortGrantLotsFifo(lots);
  let left = consumeAmount;
  const allocations: FifoAllocation[] = [];
  for (const lot of sorted) {
    if (left.lte(0)) break;
    if (lot.remaining.lte(0)) continue;
    const taken = Prisma.Decimal.min(lot.remaining, left);
    if (taken.lte(0)) continue;
    allocations.push({ entryIndex: lot.entryIndex, taken });
    lot.remaining = lot.remaining.sub(taken);
    left = left.sub(taken);
  }
  if (left.gt(0)) {
    throw new Error("insufficient credit balance");
  }
  return allocations;
}

export type WalletSimOp =
  | { kind: "grant"; amount: number; expiresAt?: Date | null }
  | { kind: "consume"; amount: number }
  | { kind: "expire"; at: Date };

/** In-memory wallet simulator for property tests (mirrors ledger sign rules). */
export function simulateWalletOps(ops: WalletSimOp[]): {
  balance: Prisma.Decimal;
  entries: SimLedgerEntry[];
} {
  const entries: SimLedgerEntry[] = [];
  for (const op of ops) {
    if (op.kind === "grant") {
      const amount = decimalAmount(op.amount);
      if (amount.lte(0)) throw new Error("grant must be positive");
      entries.push({
        type: CreditEntryType.GRANT,
        reason: "GOODWILL",
        amount,
        remaining: amount,
        expiresAt: op.expiresAt ?? null,
      });
    } else if (op.kind === "consume") {
      const amount = decimalAmount(op.amount);
      if (amount.lte(0)) throw new Error("consume must be positive");
      const lots = grantLotsFromEntries(entries);
      const allocations = allocateConsumeFifo(lots, amount);
      for (const alloc of allocations) {
        const row = entries[alloc.entryIndex];
        if (!row.remaining) row.remaining = row.amount;
        row.remaining = row.remaining.sub(alloc.taken);
      }
      entries.push({
        type: CreditEntryType.CONSUME,
        reason: "ADJUSTMENT",
        amount: amount.neg(),
      });
    } else if (op.kind === "expire") {
      const at = op.at;
      for (let i = 0; i < entries.length; i++) {
        const row = entries[i];
        if (row.type !== CreditEntryType.GRANT || !row.remaining || row.remaining.lte(0)) continue;
        if (!row.expiresAt || row.expiresAt > at) continue;
        const expiring = row.remaining;
        row.remaining = new Prisma.Decimal(0);
        entries.push({
          type: CreditEntryType.EXPIRE,
          reason: "ADJUSTMENT",
          amount: expiring.neg(),
        });
      }
    }
  }
  const balance = sumLedgerAmounts(entries);
  if (balance.lt(0)) throw new Error("negative balance");
  return { balance, entries };
}