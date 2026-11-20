import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POOL_MAX, resolvePoolMax } from "./create-prisma-client";

describe("resolvePoolMax (explicit pg pool default; the shared cluster has max_connections=100)", () => {
  const saved = process.env.DB_POOL_MAX;
  afterEach(() => { if (saved === undefined) delete process.env.DB_POOL_MAX; else process.env.DB_POOL_MAX = saved; });

  it("connection_limit in DATABASE_URL wins", () => { process.env.DB_POOL_MAX = "7"; assert.equal(resolvePoolMax(3), 3); });
  it("falls back to DB_POOL_MAX, then to the explicit default of 10", () => {
    process.env.DB_POOL_MAX = "7"; assert.equal(resolvePoolMax(Number.NaN), 7);
    delete process.env.DB_POOL_MAX; assert.equal(resolvePoolMax(0), DEFAULT_POOL_MAX); assert.equal(DEFAULT_POOL_MAX, 10);
  });
  it("ignores junk values", () => { process.env.DB_POOL_MAX = "-4"; assert.equal(resolvePoolMax(Number.NaN), DEFAULT_POOL_MAX); process.env.DB_POOL_MAX = "abc"; assert.equal(resolvePoolMax(Number.NaN), DEFAULT_POOL_MAX); });
});
