import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { HttpException, UnauthorizedException } from "@nestjs/common";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { PlatformIntegrationClientService } from "./platform-integration-client.service";

/** KX-PT-L1: the HMAC nonce store and the failed-client-secret throttle live in Postgres, so a second API instance sees what the first one saw. Two service objects on one database stand for two instances. */
const prisma = createPrismaClient();
const db = prisma as unknown as PrismaService;
describe("KX-PT-L1 shared marketplace nonce store and client-secret throttle (real DB)", () => {
  const instanceA = new PlatformIntegrationClientService(db), instanceB = new PlatformIntegrationClientService(db);
  let clientKey = ""; let secret = ""; let id = "";
  before(async () => { await prisma.$connect(); const c = await instanceA.createClient(`l1-${randomBytes(4).toString("hex")}`); clientKey = c.clientKey; secret = c.secret; id = c.id; });
  after(async () => {
    await prisma.platformIntegrationClient.deleteMany({ where: { id } });
    await prisma.$executeRawUnsafe(`DELETE FROM "MarketplaceNonce" WHERE "clientId" = $1`, id);
    await prisma.$executeRawUnsafe(`DELETE FROM "RateLimitBucket" WHERE "key" LIKE $1`, `mkt-secret-fail%${clientKey}%`);
    await prisma.$executeRawUnsafe(`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'mkt-secret-fail-ip:198.51.100.%'`);
    await prisma.$disconnect();
  });

  it("a nonce seen by one instance is refused by the other (replay on another instance inside the window)", async () => {
    const nonce = randomBytes(12).toString("base64url");
    await instanceA.assertNonce(id, nonce);
    await assert.rejects(() => instanceB.assertNonce(id, nonce), (e: unknown) => e instanceof UnauthorizedException && /Replayed nonce/.test((e as Error).message));
    await assert.rejects(() => instanceA.assertNonce(id, nonce), /Replayed nonce/);
    await instanceB.assertNonce(id, randomBytes(12).toString("base64url")); // a fresh nonce is fine; the same nonce for ANOTHER client is fine too
    await instanceB.assertNonce("some-other-client", nonce);
    await prisma.$executeRawUnsafe(`DELETE FROM "MarketplaceNonce" WHERE "clientId" = 'some-other-client'`);
  });

  it("failed secret attempts from one address are throttled (429 RATE_LIMITED) on every instance; the right secret from another address still works", async () => {
    const attacker = "198.51.100.23", legit = "198.51.100.99";
    for (let i = 0; i < 10; i++) await assert.rejects(() => (i % 2 ? instanceA : instanceB).authenticate(clientKey, `wrong-${i}`, attacker), (e: unknown) => e instanceof UnauthorizedException);
    // the 11th attempt is refused before any secret is compared, even with the CORRECT secret, and on the other instance
    for (const inst of [instanceA, instanceB]) {
      await assert.rejects(() => inst.authenticate(clientKey, secret, attacker), (e: unknown) => e instanceof HttpException && (e as HttpException).getStatus() === 429);
    }
    const ok = await instanceA.authenticate(clientKey, secret, legit);
    assert.equal(ok.id, id, "the real caller (another address) is not locked out by the attacker's guesses");
  });

  it("successful authentications are not counted against the budget", async () => {
    for (let i = 0; i < 15; i++) await instanceA.authenticate(clientKey, secret, "198.51.100.150");
  });

  it("unknown client keys count as failures per client key and address too", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 10; i++) await assert.rejects(() => instanceA.authenticate("ic_plt_nope", "x", ip), (e: unknown) => e instanceof UnauthorizedException);
    await assert.rejects(() => instanceB.authenticate("ic_plt_nope", "x", ip), (e: unknown) => e instanceof HttpException && (e as HttpException).getStatus() === 429);
    await prisma.$executeRawUnsafe(`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'mkt-secret-fail:ic_plt_nope:%'`);
  });
});
