import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaService } from "../prisma/prisma.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { AuditService } from "../audit/audit.service";
import { KiorexOidcController } from "./kiorex-oidc.controller";
import { KiorexOidcService } from "./kiorex-oidc.service";
import { loginEmailLookupVariants } from "./auth-email.util";

const prisma = createPrismaClient();
const db = prisma as unknown as PrismaService;
const SAVED = { ...process.env };
const ISSUER = "https://passport.example.test";

function controller(flagOn = true) {
  const svc = new KiorexOidcService(db, {} as never, new AuditService(db), { isEnabledForUser: async () => flagOn } as never);
  return new KiorexOidcController(svc, db);
}

/** Integration: the live organisation keeps its sign-in method until an admin switches it; Passport config is env-driven. */
describe("Passport configuration and per-organisation default sign-in (integration, private DB)", () => {
  let orgId: string;
  before(async () => {
    await prisma.$connect();
    orgId = (await prisma.user.findFirstOrThrow({ where: { email: "dr.ahmed@drahmedshall.com", deletedAt: null }, select: { tenantId: true } })).tenantId as string;
  });
  after(async () => {
    for (const k of ["KIOREX_OIDC_ISSUER", "KIOREX_OIDC_CLIENT_SECRET", "APP_WEB_URL", "WEB_PUBLIC_ORIGIN", "SIGNIN_DEFAULT_METHOD", "NODE_ENV"]) {
      if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k];
    }
    await prisma.tenant.update({ where: { id: orgId }, data: { defaultSignInMethod: null } });
    await prisma.$disconnect();
  });

  it("no organisation has an explicit sign-in method by default (schema default is automatic)", async () => {
    assert.equal(await prisma.tenant.count({ where: { defaultSignInMethod: { not: null } } }), 0);
  });

  it("Passport not configured (no issuer): the login page config is PASSWORD for the organisation, button hidden", async () => {
    delete process.env.KIOREX_OIDC_ISSUER;
    const c = await controller().config(undefined, "app.example.test", orgId, { ip: "t1" } as never);
    assert.equal(c.enabled, false);
    assert.equal(c.passportAvailable, false);
    assert.equal(c.defaultMethod, "PASSWORD");
  });

  it("production without a web origin: Passport stays OFF (no localhost redirect is ever built)", async () => {
    Object.assign(process.env, { NODE_ENV: "production", KIOREX_OIDC_ISSUER: ISSUER, KIOREX_OIDC_CLIENT_SECRET: "s".repeat(32) });
    delete process.env.APP_WEB_URL; delete process.env.WEB_PUBLIC_ORIGIN;
    const c = await controller().config(undefined, "app.example.test", orgId, { ip: "t2" } as never);
    assert.equal(c.enabled, false);
    assert.equal(c.defaultMethod, "PASSWORD");
    await assert.rejects(() => controller().start("app.example.test" as never), /not available|not configured/);
  });

  it("configured and available: both methods offered, but the organisation default is STILL password until an admin switches it", async () => {
    Object.assign(process.env, { NODE_ENV: "test", KIOREX_OIDC_ISSUER: ISSUER, KIOREX_OIDC_CLIENT_SECRET: "s".repeat(32), APP_WEB_URL: "https://clinic.example.test" });
    delete process.env.SIGNIN_DEFAULT_METHOD;
    const c = controller();
    const before = await c.config(undefined, "clinic.example.test", orgId, { ip: "t3" } as never);
    assert.equal(before.enabled, true);
    assert.equal(before.passportAvailable, true);
    assert.equal(before.defaultMethod, "PASSWORD", "existing organisation: nothing changes");
    // unknown org: uniform deployment default, same shape
    const unknown = await c.config(undefined, "clinic.example.test", "no-such-org-id", { ip: "t3" } as never);
    assert.deepEqual(Object.keys(unknown).sort(), Object.keys(before).sort());
    assert.equal(unknown.defaultMethod, "PASSWORD");
    // the admin switch: explicit organisation choice flips the preselection, and switching back restores it
    await prisma.tenant.update({ where: { id: orgId }, data: { defaultSignInMethod: "PASSPORT" } });
    assert.equal((await c.config(undefined, "clinic.example.test", orgId, { ip: "t3" } as never)).defaultMethod, "PASSPORT");
    await prisma.tenant.update({ where: { id: orgId }, data: { defaultSignInMethod: null } });
    assert.equal((await c.config(undefined, "clinic.example.test", orgId, { ip: "t3" } as never)).defaultMethod, "PASSWORD");
  });

  it("the authorization URL is built from env only (no localhost) when started in production-like configuration", async () => {
    // Port construction needs a reachable issuer; here the pure config is what matters and is covered by the unit suite.
    const { readKiorexOidcConfig } = await import("./kiorex-oidc.port");
    const cfg = readKiorexOidcConfig({ ...process.env, NODE_ENV: "production" } as never)!;
    assert.equal(cfg.redirectUri, "https://clinic.example.test/auth/kiorex/callback");
    assert.doesNotMatch(JSON.stringify(cfg), /localhost/);
  });

  it("sign-in e-mail aliasing uses the configured demo domain and keeps the legacy default", () => {
    assert.deepEqual(loginEmailLookupVariants("physician@kiorly.com").sort(), ["physician@demo.clinic", "physician@kiorly.com"]);
    process.env.DEMO_EMAIL_DOMAIN = "demo.example.test";
    try {
      assert.deepEqual(loginEmailLookupVariants("a@demo.example.test").sort(), ["a@demo.clinic", "a@demo.example.test"]);
      assert.deepEqual(loginEmailLookupVariants("a@kiorly.com"), ["a@kiorly.com"]);
    } finally { delete process.env.DEMO_EMAIL_DOMAIN; }
  });
});
