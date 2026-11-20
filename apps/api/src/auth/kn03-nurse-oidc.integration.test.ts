import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { KiorexOidcService } from "./kiorex-oidc.service";
import { readKiorexOidcConfig, type KiorexOidcPort } from "./kiorex-oidc.port";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("KNED/ADR-031 OIDC is edition-aware without a second client", () => {
  const seen: { authRedirect?: string; exchangeRedirect?: string }[] = [];
  const port: KiorexOidcPort = {
    issuer: "https://account.kiorex.test",
    clientId: "kiorly-clinic",
    authorizationUrl: ({ state, redirectUri }) => {
      seen.push({ authRedirect: redirectUri });
      return `https://account.kiorex.test/authorize?state=${state}`;
    },
    exchange: async (_p, _c, opts) => {
      seen.push({ exchangeRedirect: opts?.redirectUri });
      return { sub: "nobody-linked" };
    },
    logoutKeys: () => (async () => { throw new Error("n/a"); }) as never,
  };
  let svc: KiorexOidcService;

  before(async () => {
    await prisma.$connect();
    process.env.KIOREX_OIDC_ISSUER = "https://account.kiorex.test";
    delete process.env.KIOREX_OIDC_REDIRECT_URI_NURSE;
    svc = new KiorexOidcService(prisma as unknown as PrismaService, {} as never, new AuditService(prisma as unknown as PrismaService), { isEnabledForUser: async () => true } as never);
    svc.setPortForTests(port);
  });
  after(async () => {
    await prisma.kiorexOidcTransaction.deleteMany({ where: { nonce: { not: "-" }, mode: "LOGIN", edition: { in: ["NURSE", "CLINIC"] } } });
    await prisma.$disconnect();
  });

  it("config: same client id / audience for both editions; Nurse has its own redirect URI on nurse.kiorly.com", () => {
    const dev = readKiorexOidcConfig({ KIOREX_OIDC_ISSUER: "https://a.test", NODE_ENV: "development", APP_WEB_URL: "http://localhost:5174" } as never)!;
    assert.equal(dev.clientId, "kiorly-clinic");
    assert.equal(dev.redirectUri, "http://localhost:5174/auth/kiorex/callback");
    assert.equal(dev.nurseRedirectUri, "http://nurse.localhost:5174/auth/kiorex/callback");
    const prod = readKiorexOidcConfig({ KIOREX_OIDC_ISSUER: "https://a.test", NODE_ENV: "production", KIOREX_OIDC_CLIENT_SECRET: "s", APP_WEB_URL: "https://app.kiorly.com" } as never)!;
    assert.equal(prod.nurseRedirectUri, "https://nurse.kiorly.com/auth/kiorex/callback");
    assert.equal(prod.clientId, "kiorly-clinic", "no second client, no edition claim: the edition is a UI default, not a token claim");
  });

  it("NURSE sign-in starts and completes on the nurse redirect URI; CLINIC keeps the default; the transaction remembers the edition", async () => {
    const nurse = await svc.startLogin("NURSE");
    const nurseState = new URL(nurse.authorizationUrl).searchParams.get("state")!;
    assert.equal(seen.at(-1)!.authRedirect, "http://nurse.localhost:5174/auth/kiorex/callback");
    assert.equal((await prisma.kiorexOidcTransaction.findUniqueOrThrow({ where: { state: nurseState } })).edition, "NURSE");
    assert.deepEqual(await svc.handleCallback({ code: "c", state: nurseState }, {} as never), { status: "LINK_REQUIRED" });
    assert.equal(seen.at(-1)!.exchangeRedirect, "http://nurse.localhost:5174/auth/kiorex/callback");

    const clinic = await svc.startLogin("CLINIC");
    const clinicState = new URL(clinic.authorizationUrl).searchParams.get("state")!;
    assert.equal(seen.at(-1)!.authRedirect, undefined);
    await svc.handleCallback({ code: "c", state: clinicState }, {} as never);
    assert.equal(seen.at(-1)!.exchangeRedirect, undefined);
  });
});
