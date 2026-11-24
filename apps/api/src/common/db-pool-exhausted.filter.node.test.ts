import "reflect-metadata";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { isDbPoolExhausted, replyIfDbPoolExhausted } from "./db-pool-exhausted.filter";
import { orderedGlobalFilters } from "./global-filters";
import { createPrismaAdapter, resolvePoolTimeoutMs, DEFAULT_POOL_TIMEOUT_MS } from "../prisma/create-prisma-client";

/** Same shape as IntegrationFailureExceptionFilter: a @Catch() catch-all that answers 500 for anything that is not an HttpException, after the pool check. */
@Catch()
class CatchAll implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    if (replyIfDbPoolExhausted(e, host)) return;
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) res.status(e.getStatus()).json(e.getResponse()); else res.status(500).json({ statusCode: 500, message: "Internal server error" });
  }
}

@Controller()
class Probe {
  @Get("pool") pool() { throw new Error("timeout exceeded when trying to connect"); }
  @Get("p2024") p2024() { throw new Prisma.PrismaClientKnownRequestError("Timed out fetching a new connection from the connection pool", { code: "P2024", clientVersion: "x" }); }
  @Get("schema") schema() { throw new Prisma.PrismaClientKnownRequestError("column missing", { code: "P2022", clientVersion: "x" }); }
  @Get("other") other() { throw new Error("boom"); }
}
@Module({ controllers: [Probe] })
class ProbeModule {}

describe("pool saturation and Prisma faults map to 503 (was: everything non-HTTP became an unexplained 500)", () => {
  let app: INestApplication; let base = "";
  before(async () => {
    app = await NestFactory.create(ProbeModule, { logger: false });
    app.useGlobalFilters(...orderedGlobalFilters(new CatchAll()));
    await app.listen(0, "127.0.0.1"); base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  });
  after(async () => { await app.close(); });

  it("a saturated pg pool answers 503 + Retry-After through the catch-all", async () => {
    const r = await fetch(`${base}/pool`);
    assert.equal(r.status, 503); assert.equal(r.headers.get("retry-after"), "2");
    assert.deepEqual(await r.json(), { statusCode: 503, error: "Database busy", message: "The service is briefly overloaded. Please retry in a moment.", retryAfterSeconds: 2 });
  });
  it("Prisma P2024 (pool timeout) answers 503 + Retry-After", async () => {
    const r = await fetch(`${base}/p2024`);
    assert.equal(r.status, 503); assert.equal(r.headers.get("retry-after"), "2");
  });
  it("the Prisma filter is reachable behind the catch-all (schema mismatch P2022 -> 503, not 500)", async () => {
    const r = await fetch(`${base}/schema`);
    assert.equal(r.status, 503); assert.equal(((await r.json()) as { error: string }).error, "Schema mismatch");
  });
  it("anything else still falls to the catch-all's 500", async () => {
    assert.equal((await fetch(`${base}/other`)).status, 500);
  });
});

describe("isDbPoolExhausted", () => {
  it("recognises pg-pool, Prisma and Postgres capacity errors only", () => {
    assert.equal(isDbPoolExhausted(new Error("timeout exceeded when trying to connect")), true);
    assert.equal(isDbPoolExhausted(Object.assign(new Error("x"), { code: "53300" })), true);
    assert.equal(isDbPoolExhausted(new Error("sorry, too many clients already")), true);
    assert.equal(isDbPoolExhausted(new Error("duplicate key")), false);
    assert.equal(isDbPoolExhausted("timeout exceeded when trying to connect"), false);
  });
});

describe("pool timeout is explicit and configurable", () => {
  it("pool_timeout (seconds) wins, then DB_POOL_TIMEOUT_MS, then 10 s", () => {
    const saved = process.env.DB_POOL_TIMEOUT_MS;
    try {
      delete process.env.DB_POOL_TIMEOUT_MS;
      assert.equal(resolvePoolTimeoutMs(Number.NaN), DEFAULT_POOL_TIMEOUT_MS);
      assert.equal(resolvePoolTimeoutMs(3), 3000);
      process.env.DB_POOL_TIMEOUT_MS = "2500"; assert.equal(resolvePoolTimeoutMs(0), 2500);
      process.env.DB_POOL_TIMEOUT_MS = "junk"; assert.equal(resolvePoolTimeoutMs(0), DEFAULT_POOL_TIMEOUT_MS);
    } finally { if (saved === undefined) delete process.env.DB_POOL_TIMEOUT_MS; else process.env.DB_POOL_TIMEOUT_MS = saved; }
  });
  it("the adapter takes max, timeout and idle settings from DATABASE_URL", () => {
    const a = createPrismaAdapter("postgresql://u:p@127.0.0.1:5433/x?schema=public&connection_limit=4&pool_timeout=3") as unknown as { config: Record<string, unknown> };
    assert.equal(a.config.max, 4); assert.equal(a.config.connectionTimeoutMillis, 3000); assert.equal(a.config.idleTimeoutMillis, 30000);
    assert.doesNotMatch(String(a.config.connectionString), /pool_timeout|connection_limit/);
  });
});
