import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectionForAllocation,
  installmentReminderDaysBefore,
  installmentStatus,
  installmentsSettled,
  normalizeAllocations,
} from "./split-payment";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("MN-06 split payment helpers", () => {
  it("normalizes allocations and refuses bad parts", () => {
    const r = normalizeAllocations([
      { method: "cash", amount: 100.004 },
      { method: "CARD", amount: 49.996 },
    ]);
    assert.equal(r.total, 150);
    assert.deepEqual(r.allocations.map((a) => a.method), ["CASH", "CARD"]);
    assert.throws(() => normalizeAllocations([]), /at least one/);
    assert.throws(() => normalizeAllocations([{ method: "CASH", amount: 0 }]), /positive/);
    assert.throws(() => normalizeAllocations([{ method: "KIOREX_PAY", amount: 10 }]), /cannot be used/);
  });

  it("transfers and wallets are money transfers with channel + reference", () => {
    assert.deepEqual(collectionForAllocation({ method: "WALLET", amount: 1, channel: "INSTAPAY", reference: "R1" }), {
      collectionMode: "MONEY_TRANSFER",
      transferChannel: "INSTAPAY",
      transferReference: "R1",
    });
    assert.equal(collectionForAllocation({ method: "TRANSFER", amount: 1, channel: null, reference: null }).transferChannel, "TRANSFER");
    assert.equal(collectionForAllocation({ method: "CARD", amount: 1, channel: null, reference: null }).collectionMode, "CASH_ON_VISIT");
  });

  it("installments settle oldest first and only when fully covered", () => {
    const inst = [
      { id: "a", dueOn: d("2026-01-01"), amount: 1000, paidAt: null },
      { id: "b", dueOn: d("2026-02-01"), amount: 1000, paidAt: null },
      { id: "c", dueOn: d("2026-03-01"), amount: 1000, paidAt: null },
    ];
    assert.deepEqual(installmentsSettled(inst, 3000), []);
    assert.deepEqual(installmentsSettled(inst, 2500), [], "half an installment settles nothing");
    assert.deepEqual(installmentsSettled(inst, 2000), ["a"]);
    assert.deepEqual(installmentsSettled(inst, 0), ["a", "b", "c"]);
    const withPaid = [{ ...inst[0]!, paidAt: d("2026-01-01") }, inst[1]!, inst[2]!];
    assert.deepEqual(installmentsSettled(withPaid, 1000), ["b"]);
    // schedule covers only part of the balance: extra balance is owed after the schedule
    assert.deepEqual(installmentsSettled(inst, 3500), []);
  });

  it("status by clinic-local date", () => {
    assert.equal(installmentStatus("2026-03-01", null, "2026-03-02", 2), "OVERDUE");
    assert.equal(installmentStatus("2026-03-04", null, "2026-03-02", 2), "DUE_SOON");
    assert.equal(installmentStatus("2026-03-05", null, "2026-03-02", 2), "UPCOMING");
    assert.equal(installmentStatus("2026-03-01", new Date(), "2026-03-02", 2), "PAID");
    assert.equal(installmentReminderDaysBefore({ billing: { installmentReminderDaysBefore: 5 } }), 5);
    assert.equal(installmentReminderDaysBefore({}), 2);
  });
});
