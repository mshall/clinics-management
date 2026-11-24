import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { PgRateLimiter, type RawSql } from "./pg-rate-limit";
import { PublicAuthRateLimitGuard } from "./rate-limit.guard";
import { clearRateLimitStore } from "./rate-limit";

/** An in-memory stand-in for the `RateLimitBucket` table that honours the same INSERT .. ON CONFLICT .. WHERE count < limit contract, shared by every limiter built on it. */
function fakeDb(): RawSql & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  return {
    rows,
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      if (q.startsWith("INSERT")) {
        const k = `${v[0]}@${(v[1] as Date).getTime()}`, limit = Number(v[3]), n = rows.get(k) ?? 0;
        if (n >= limit) return [] as T;
        rows.set(k, n + 1); return [{ count: n + 1 }] as T;
      }
      const k = `${v[0]}@${(v[1] as Date).getTime()}`; return (rows.has(k) ? [{ count: rows.get(k) }] : []) as T;
    },
    async $executeRawUnsafe() { return 0; },
  };
}

describe("PgRateLimiter (shared across instances)", () => {
  it("two limiters on one table share one budget; a refused hit is not counted; blocked() only reads", async () => {
    const db = fakeDb(); const now = () => 1_000_000;
    const a = new PgRateLimiter(db, now), b = new PgRateLimiter(db, now);
    assert.equal((await a.hit("k", 2, 60_000)).ok, true);
    assert.equal((await b.hit("k", 2, 60_000)).ok, true);
    const third = await a.hit("k", 2, 60_000);
    assert.equal(third.ok, false); assert.ok(third.retryAfterSec >= 1);
    assert.equal((await b.blocked("k", 2, 60_000)).ok, false);
    assert.equal((await b.blocked("other", 2, 60_000)).ok, true);
    assert.equal([...db.rows.values()][0], 2, "the refused hit did not raise the counter");
  });

  it("the sign-in guard of two instances enforces one login budget per account (KX-PT-L1: it used to be N budgets for N instances)", async () => {
    clearRateLimitStore();
    const db = fakeDb();
    const g1 = new PublicAuthRateLimitGuard({ $queryRawUnsafe: db.$queryRawUnsafe, $executeRawUnsafe: db.$executeRawUnsafe } as never);
    const g2 = new PublicAuthRateLimitGuard({ $queryRawUnsafe: db.$queryRawUnsafe, $executeRawUnsafe: db.$executeRawUnsafe } as never);
    // a different source address every time, so only the per-ACCOUNT budget (20 per 15 minutes) can refuse
    const ctx = (i: number) => ({ switchToHttp: () => ({ getRequest: () => ({ originalUrl: "/api/v1/auth/login", method: "POST", headers: {}, socket: { remoteAddress: `203.0.113.${i}` }, body: { email: "Victim@Clinic.test", password: "x" } }) }) }) as never;
    let refused = 0;
    for (let i = 0; i < 30; i++) {
      try { await (i % 2 ? g1 : g2).canActivate(ctx(i + 1)); } catch (e) { assert.equal((e as HttpException).getStatus(), 429); refused++; }
    }
    assert.equal(refused, 10, "20 attempts pass in total across both instances, the remaining 10 are refused");
  });

  it("falls back to the per-instance window when the shared table is unavailable (never a 500 on the login path)", async () => {
    clearRateLimitStore();
    const broken = { $queryRawUnsafe: async () => { throw new Error("relation \"RateLimitBucket\" does not exist"); }, $executeRawUnsafe: async () => 0 };
    const g = new PublicAuthRateLimitGuard(broken as never);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ originalUrl: "/api/v1/auth/login", method: "POST", headers: {}, socket: { remoteAddress: "198.51.100.77" }, body: { email: "a@b.test" } }) }) } as never;
    assert.equal(await g.canActivate(ctx), true);
  });
});
