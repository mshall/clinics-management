import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { PromotionsMarketplaceController } from "./promotions-marketplace.controller";
import { PromotionBudgetService, ReserveBusyError, RESERVE_MAX_QUEUE } from "./promotion-budget.service";

/** W8 integration finding: 20 parallel reserves on one promotion held up to 20 s transactions and answered 500/503 without a retry hint. The reserve is now admitted one at a time per promotion in memory; a flood answers 503 + Retry-After and the cap is never touched. */
describe("reserve admission and the busy answer", () => {
  const gateOf = () => new PromotionBudgetService({} as never, {} as never, {} as never, {} as never) as unknown as { admit<T>(id: string, fn: () => Promise<T>): Promise<T>; gates: Map<string, unknown> };
  it("runs callers of one promotion strictly one at a time, in order, and forgets the promotion afterwards", async () => {
    const s = gateOf(); let running = 0; let peak = 0; const order: number[] = [];
    await Promise.all(Array.from({ length: 30 }, (_, n) => s.admit("p1", async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 2)); order.push(n); running--; })));
    assert.equal(peak, 1);
    assert.deepEqual(order, Array.from({ length: 30 }, (_, n) => n));
    assert.equal(s.gates.size, 0);
  });
  it("different promotions do not wait for each other", async () => {
    const s = gateOf(); let release!: () => void; const blocked = new Promise<void>((r) => { release = r; });
    const a = s.admit("pa", () => blocked); let bDone = false;
    await s.admit("pb", async () => { bDone = true; });
    assert.equal(bDone, true); release(); await a;
  });
  it("a full queue is ReserveBusyError at once (no wait, nothing started), and the queue recovers", async () => {
    const s = gateOf(); let release!: () => void; const blocked = new Promise<void>((r) => { release = r; });
    const held = Array.from({ length: RESERVE_MAX_QUEUE }, () => s.admit("pq", () => blocked));
    await assert.rejects(() => s.admit("pq", async () => "late"), (e) => e instanceof ReserveBusyError && e.retryAfterSeconds >= 1);
    release(); await Promise.all(held);
    assert.equal(await s.admit("pq", async () => "ok"), "ok");
  });
  it("an error inside a turn passes the turn on", async () => {
    const s = gateOf();
    await assert.rejects(() => s.admit("pe", async () => { throw new Error("boom"); }), /boom/);
    assert.equal(await s.admit("pe", async () => 1), 1);
  });
  it("the controller answers 503 PROMOTION_RESERVE_BUSY with a Retry-After header", async () => {
    const budget = { reserve: async () => { throw new ReserveBusyError(3); } };
    const prisma = { sponsoredPromotion: { findUnique: async () => ({ tenantId: "t" }) }, marketplaceListing: { count: async () => 1 } };
    const c = new PromotionsMarketplaceController(prisma as never, budget as never, {} as never);
    const headers: Record<string, string> = {};
    const body = { version: 1, bookingRef: "KIOREX-1", patientRef: "pref1", careType: "IN_CLINIC", amountMinor: 100, currency: "EGP", idempotencyKey: "idem-1234567890" };
    await assert.rejects(() => c.reserve("p", body, { setHeader: (k: string, v: string) => { headers[k] = v; } } as never), (e: unknown) => e instanceof ServiceUnavailableException && (e.getResponse() as { code?: string }).code === "PROMOTION_RESERVE_BUSY");
    assert.equal(headers["Retry-After"], "3");
  });
});
