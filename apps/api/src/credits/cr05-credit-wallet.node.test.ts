import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { describe, it } from "node:test";
import { CreditEntryType, Prisma } from "@prisma/client";
import {
  allocateConsumeFifo,
  decimalAmount,
  grantLotsFromEntries,
  simulateWalletOps,
  sumLedgerAmounts,
  type SimLedgerEntry,
  type WalletSimOp,
} from "./credit-wallet-math";

function randomOps(seed: number, count: number): WalletSimOp[] {
  const ops: WalletSimOp[] = [];
  let rng = seed;
  const next = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng;
  };
  for (let i = 0; i < count; i++) {
    const roll = next() % 10;
    if (roll < 5) {
      ops.push({ kind: "grant", amount: (next() % 400) + 1, expiresAt: roll < 2 ? new Date(Date.now() + (next() % 5) * 86_400_000) : null });
    } else if (roll < 8) {
      ops.push({ kind: "consume", amount: (next() % 120) + 1 });
    } else {
      ops.push({ kind: "expire", at: new Date(Date.now() + (next() % 3) * 86_400_000) });
    }
  }
  return ops;
}

describe("CR-05 credit wallet math", () => {
  it("FIFO consumes earliest expiry first", () => {
    const entries: SimLedgerEntry[] = [
      {
        type: CreditEntryType.GRANT,
        reason: "PROMO",
        amount: decimalAmount(50),
        remaining: decimalAmount(50),
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
      {
        type: CreditEntryType.GRANT,
        reason: "PROMO",
        amount: decimalAmount(30),
        remaining: decimalAmount(30),
        expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ];
    const lots = grantLotsFromEntries(entries);
    const allocations = allocateConsumeFifo(lots, decimalAmount(40));
    assert.equal(allocations.length, 2);
    assert.equal(allocations[0].entryIndex, 1);
    assert.ok(allocations[0].taken.eq(30));
    assert.equal(allocations[1].entryIndex, 0);
    assert.ok(allocations[1].taken.eq(10));
  });

  it("property: random grant/consume/expire sequences keep balance = sum(entries) and never negative", () => {
    for (let seed = 0; seed < 40; seed++) {
      const ops = randomOps(seed + randomInt(1000), 25);
      let applied: WalletSimOp[] = [];
      for (const op of ops) {
        try {
          const trial = simulateWalletOps([...applied, op]);
          assert.ok(trial.balance.gte(0), `negative balance seed=${seed}`);
          assert.ok(
            trial.balance.eq(sumLedgerAmounts(trial.entries)),
            `balance mismatch seed=${seed}`,
          );
          applied = [...applied, op];
        } catch (e) {
          if (op.kind === "consume") {
            continue;
          }
          throw e;
        }
      }
      if (applied.length > 0) {
        const finalState = simulateWalletOps(applied);
        assert.ok(finalState.balance.gte(0));
        assert.ok(finalState.balance.eq(sumLedgerAmounts(finalState.entries)));
      }
    }
  });

  it("expire removes only expired grant remainder", () => {
    const result = simulateWalletOps([
      { kind: "grant", amount: 100, expiresAt: new Date("2025-01-01T00:00:00.000Z") },
      { kind: "grant", amount: 50, expiresAt: new Date("2030-01-01T00:00:00.000Z") },
      { kind: "expire", at: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    assert.ok(result.balance.eq(new Prisma.Decimal(50)));
  });
});