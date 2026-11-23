import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../prisma/prisma.service";
import { clinicDeploymentDefault, orgSignInFacts, resolvePublicSignInConfig, tenantLinkedToKiorex } from "./sign-in-config";

/** A tiny in-memory stand-in for the four Prisma calls the config uses. */
function fake(o: { tenants: Array<{ id: string; defaultSignInMethod: "PASSWORD" | "PASSPORT" | null }>; links?: string[]; listings?: string[] }) {
  return {
    tenant: { findUnique: async ({ where }: { where: { id: string } }) => o.tenants.find((t) => t.id === where.id) ?? null },
    kiorexIdentityLink: { count: async ({ where }: { where: { user: { tenantId: string } } }) => (o.links ?? []).filter((x) => x === where.user.tenantId).length },
    marketplaceListing: { count: async ({ where }: { where: { tenantId: string } }) => (o.listings ?? []).filter((x) => x === where.tenantId).length },
  } as unknown as PrismaService;
}

describe("clinic sign-in default config", () => {
  const db = fake({ tenants: [{ id: "tenantStandalone1", defaultSignInMethod: null }, { id: "tenantLinked12345", defaultSignInMethod: null }, { id: "tenantPinned12345", defaultSignInMethod: "PASSWORD" }], links: ["tenantLinked12345", "tenantPinned12345"] });
  const answer = async (org: string | undefined, edition: "CLINIC" | "NURSE" = "CLINIC", env: Record<string, string | undefined> = {}) =>
    resolvePublicSignInConfig({ passportAvailable: true, org: org ? await orgSignInFacts(db, org) : null, deployment: clinicDeploymentDefault(edition, env) });

  it("linked org is PASSPORT, standalone org is PASSWORD, an explicit choice wins", async () => {
    assert.equal(await tenantLinkedToKiorex(db, "tenantLinked12345"), true);
    assert.equal((await answer("tenantStandalone1")).defaultMethod, "PASSWORD");
    assert.equal((await answer("tenantLinked12345")).defaultMethod, "PASSPORT");
    assert.equal((await answer("tenantPinned12345")).defaultMethod, "PASSWORD");
  });
  it("unknown org and malformed hints get the deployment default with the same shape", async () => {
    const a = await answer("nope-nope-nope"); const b = await answer("tenantLinked12345");
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    assert.equal(a.defaultMethod, "PASSWORD");
    assert.equal((await answer("bad hint; drop")).defaultMethod, "PASSWORD");
    assert.equal((await answer(undefined, "CLINIC", { SIGNIN_DEFAULT_METHOD: "PASSPORT" })).defaultMethod, "PASSPORT");
  });
  it("the Nurse host keeps its Passport-first default; the env override applies on top", async () => {
    assert.equal((await answer(undefined, "NURSE")).defaultMethod, "PASSPORT");
    assert.equal((await answer(undefined, "NURSE", { SIGNIN_DEFAULT_METHOD: "PASSWORD" })).defaultMethod, "PASSWORD");
    assert.equal((await answer("tenantStandalone1", "NURSE")).defaultMethod, "PASSWORD", "an org's own default beats the edition default");
  });
  it("Passport unavailable: always PASSWORD", async () => {
    assert.deepEqual(resolvePublicSignInConfig({ passportAvailable: false, org: { stored: "PASSPORT", linkedToKiorex: true }, deployment: "PASSPORT" }), { passportAvailable: false, defaultMethod: "PASSWORD" });
  });
});
