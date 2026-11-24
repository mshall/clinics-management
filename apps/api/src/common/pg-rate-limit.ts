/**
 * Cross-instance rate limiter on the product's own Postgres (same pattern as Kiorly Pharmacy / Lab `common/pg-rate-limit`): one row per (key, aligned window),
 * a hit is ONE atomic `INSERT .. ON CONFLICT DO UPDATE .. WHERE count < limit RETURNING`, so concurrent API instances can never over-admit and a refused hit is not counted.
 * `peek` reads the count without consuming (used to throttle only FAILED attempts: peek before the check, `hit` when it failed).
 */
export interface RawSql { $queryRawUnsafe<T = unknown>(q: string, ...v: unknown[]): Promise<T>; $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> }
export interface LimitResult { ok: boolean; retryAfterSec: number }

export class PgRateLimiter {
  constructor(private readonly db: RawSql, private readonly now: () => number = Date.now) {}
  private win(key: string, windowMs: number) { const t = this.now(); const start = Math.floor(t / windowMs) * windowMs; return { k: `${key}|${windowMs}`, start: new Date(start), end: start + windowMs, t }; }

  async hit(key: string, limit: number, windowMs: number): Promise<LimitResult> {
    const w = this.win(key, windowMs);
    const rows = await this.db.$queryRawUnsafe<{ count: number }[]>(
      `INSERT INTO "RateLimitBucket" ("key","windowStart","count","expiresAt") VALUES ($1,$2,1,$3)
       ON CONFLICT ("key","windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1 WHERE "RateLimitBucket"."count" < $4 RETURNING "count"`,
      w.k, w.start, new Date(w.end + 60_000), limit);
    if (Math.random() < 0.01) void this.sweep().catch(() => undefined);
    return rows.length ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.end - w.t) / 1000)) };
  }

  /** Is the bucket already full? Does not count. */
  async blocked(key: string, limit: number, windowMs: number): Promise<LimitResult> {
    const w = this.win(key, windowMs);
    const rows = await this.db.$queryRawUnsafe<{ count: number }[]>(`SELECT "count" FROM "RateLimitBucket" WHERE "key" = $1 AND "windowStart" = $2`, w.k, w.start);
    return rows.length && Number(rows[0].count) >= limit ? { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.end - w.t) / 1000)) } : { ok: true, retryAfterSec: 0 };
  }

  async sweep(): Promise<number> {
    return this.db.$executeRawUnsafe(`DELETE FROM "RateLimitBucket" WHERE "expiresAt" < $1`, new Date(this.now()));
  }
  async reset(): Promise<void> { await this.db.$executeRawUnsafe(`DELETE FROM "RateLimitBucket"`); }
}
