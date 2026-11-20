import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { randomUUID } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthSessionService } from "./auth-session.service";
import { KiorexOidcService } from "./kiorex-oidc.service";
import type { KiorexIdentityClaims, KiorexOidcPort } from "./kiorex-oidc.port";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const sessions = new AuthSessionService(prismaSvc);
const ISSUER = "http://localhost:4400";
const CLIENT = "kiorly-clinic";

describe("KCV-201 Sign in with Kiorex Passport", () => {
  let userId: string;
  let otherUserId: string;
  let privateKey: CryptoKey;
  let jwks: JWK[];
  let nextClaims: KiorexIdentityClaims;
  let mfaFor = new Set<string>();
  let svc: KiorexOidcService;
  let lastChecks: { state: string; nonce: string; codeVerifier: string } | null = null;
  let lastChallenge = "";
  const savedIssuer = process.env.KIOREX_OIDC_ISSUER;

  const auth = {
    issueSsoSession: async (uid: string, mfaCode?: string) => {
      if (mfaFor.has(uid) && mfaCode !== "123456") {
        const { UnauthorizedException } = await import("@nestjs/common");
        throw new UnauthorizedException({ errorCode: "MFA_REQUIRED", mfaWhatsApp: false });
      }
      const s = await sessions.createSession(uid);
      return { accessToken: "jwt", sessionId: s.sessionId, refreshToken: s.refreshToken, user: { id: uid } };
    },
  };

  const port = (): KiorexOidcPort => ({
    issuer: ISSUER,
    clientId: CLIENT,
    authorizationUrl: ({ state, nonce, codeChallenge }) => {
      lastChallenge = codeChallenge;
      void nonce;
      return `${ISSUER}/auth?state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    },
    exchange: async (_p, checks) => {
      lastChecks = checks;
      return nextClaims;
    },
    logoutKeys: () => createLocalJWKSet({ keys: jwks }),
  });

  async function logoutToken(claims: Record<string, unknown>, over: { aud?: string; iss?: string } = {}) {
    return new SignJWT({ events: { "http://schemas.openid.net/event/backchannel-logout": {} }, ...claims })
      .setProtectedHeader({ alg: "RS256", typ: "logout+jwt", kid: "k1" })
      .setIssuer(over.iss ?? ISSUER)
      .setAudience(over.aud ?? CLIENT)
      .setIssuedAt()
      .setExpirationTime("2m")
      .setJti(randomUUID())
      .sign(privateKey);
  }

  async function startAndState(): Promise<string> {
    const { authorizationUrl } = await svc.startLogin();
    return new URL(authorizationUrl).searchParams.get("state")!;
  }

  before(async () => {
    await prisma.$connect();
    process.env.KIOREX_OIDC_ISSUER = ISSUER;
    const u = await prisma.user.findFirstOrThrow({ where: { email: "dr.ahmed@drahmedshall.com", deletedAt: null } });
    const o = await prisma.user.findFirstOrThrow({ where: { email: "admin@drahmedshall.com", deletedAt: null } });
    userId = u.id;
    otherUserId = o.id;
    const kp = await generateKeyPair("RS256");
    privateKey = kp.privateKey as CryptoKey;
    jwks = [{ ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" }];
    svc = new KiorexOidcService(prismaSvc, auth as never, new AuditService(prismaSvc), { isEnabledForUser: async () => true } as never);
    svc.setPortForTests(port());
  });
  beforeEach(async () => {
    await prisma.kiorexIdentityLink.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.kiorexOidcTransaction.deleteMany({});
    await prisma.userSession.deleteMany({ where: { kiorexSid: { not: null } } });
    mfaFor = new Set();
  });
  after(async () => {
    await prisma.kiorexIdentityLink.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.kiorexOidcTransaction.deleteMany({});
    if (savedIssuer === undefined) delete process.env.KIOREX_OIDC_ISSUER;
    else process.env.KIOREX_OIDC_ISSUER = savedIssuer;
    await prisma.$disconnect();
  });

  it("unset KIOREX_OIDC_ISSUER ⇒ disabled, no behaviour change", async () => {
    const off = new KiorexOidcService(prismaSvc, auth as never, new AuditService(prismaSvc), { isEnabledForUser: async () => true } as never);
    const keep = process.env.KIOREX_OIDC_ISSUER;
    delete process.env.KIOREX_OIDC_ISSUER;
    assert.equal(await off.isEnabled(), false);
    await assert.rejects(() => off.startLogin());
    process.env.KIOREX_OIDC_ISSUER = keep;
  });

  it("account.provider_sso OFF hides the button", async () => {
    const flagOff = new KiorexOidcService(prismaSvc, auth as never, new AuditService(prismaSvc), { isEnabledForUser: async () => false } as never);
    assert.equal(await flagOff.isEnabled(), false);
  });

  it("start uses PKCE S256 and the state/nonce/verifier are stored server-side", async () => {
    const state = await startAndState();
    assert.match(lastChallenge, /^[A-Za-z0-9_-]{43}$/);
    const txn = await prisma.kiorexOidcTransaction.findUniqueOrThrow({ where: { state } });
    assert.equal(txn.mode, "LOGIN");
    assert.ok(txn.codeVerifier.length >= 43 && txn.nonce.length > 20);
  });

  it("unlinked subject is never auto-merged or auto-created", async () => {
    nextClaims = { sub: "kx-sub-unlinked", phone_number_verified: true };
    const state = await startAndState();
    const res = await svc.handleCallback({ code: "c", state }, {});
    assert.deepEqual(res, { status: "LINK_REQUIRED" });
    assert.equal(await prisma.kiorexIdentityLink.count({ where: { subject: "kx-sub-unlinked" } }), 0);
  });

  it("link requires password re-auth; then login works and binds sid; transaction is single-use", async () => {
    await assert.rejects(() => svc.startLink(userId, "wrong-password"));
    const { authorizationUrl } = await svc.startLink(userId, "demo");
    const state = new URL(authorizationUrl).searchParams.get("state")!;
    nextClaims = { sub: "kx-sub-1", phone_number_verified: true };
    assert.deepEqual(await svc.handleCallback({ code: "c", state }, {}), { status: "LINKED" });
    assert.equal(lastChecks?.state, state);
    await assert.rejects(() => svc.handleCallback({ code: "c", state }, {}), /Unknown or expired/);

    const s2 = await startAndState();
    nextClaims = { sub: "kx-sub-1", sid: "sid-A" };
    const res = await svc.handleCallback({ code: "c", state: s2 }, {});
    assert.equal(res.status, "SESSION");
    const row = await prisma.userSession.findFirstOrThrow({ where: { kiorexSid: "sid-A" } });
    assert.equal(row.userId, userId);
    assert.equal(row.revokedAt, null);
  });

  it("a Kiorex subject can't be linked to two users, nor a user to two subjects", async () => {
    const a = await svc.startLink(userId, "demo");
    nextClaims = { sub: "kx-sub-2" };
    await svc.handleCallback({ code: "c", state: new URL(a.authorizationUrl).searchParams.get("state")! }, {});
    await assert.rejects(() => svc.startLink(userId, "demo"), /already linked/);
    const b = await svc.startLink(otherUserId, "demo");
    await assert.rejects(
      () => svc.handleCallback({ code: "c", state: new URL(b.authorizationUrl).searchParams.get("state")! }, {}),
      /already linked to another/,
    );
  });

  it("MFA user: Kiorex login alone does not unlock — TOTP step-up ticket required", async () => {
    await prisma.kiorexIdentityLink.create({ data: { userId, issuer: ISSUER, subject: "kx-sub-mfa", linkedVia: "PASSWORD_REAUTH" } });
    mfaFor.add(userId);
    nextClaims = { sub: "kx-sub-mfa", sid: "sid-M" };
    const state = await startAndState();
    const res = await svc.handleCallback({ code: "c", state }, {});
    assert.equal(res.status, "MFA_REQUIRED");
    const ticket = (res as { ticket: string }).ticket;
    await assert.rejects(() => svc.completeWithMfa(ticket, "000000", {}));
    const done = await svc.completeWithMfa(ticket, "123456", {});
    assert.equal(done.status, "SESSION");
    assert.equal((await prisma.userSession.findFirstOrThrow({ where: { kiorexSid: "sid-M" } })).userId, userId);
    await assert.rejects(() => svc.completeWithMfa(ticket, "123456", {}), /Unknown or expired/);
  });

  it("back-channel logout revokes sessions by sid; rejects bad aud/signature/replay", async () => {
    await prisma.kiorexIdentityLink.create({ data: { userId, issuer: ISSUER, subject: "kx-sub-bc", linkedVia: "PASSWORD_REAUTH" } });
    const s = await sessions.createSession(userId);
    await prisma.userSession.update({ where: { id: s.sessionId }, data: { kiorexSid: "sid-BC" } });
    const tok = await logoutToken({ sid: "sid-BC", sub: "kx-sub-bc" });
    assert.deepEqual(await svc.backchannelLogout(tok), { revoked: 1 });
    assert.ok((await prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } })).revokedAt);
    await assert.rejects(() => svc.backchannelLogout(tok), /replayed/);
    const badAud = await logoutToken({ sid: "x" }, { aud: "other" });
    await assert.rejects(() => svc.backchannelLogout(badAud), /invalid logout token/);
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ events: { "http://schemas.openid.net/event/backchannel-logout": {} }, sid: "x" })
      .setProtectedHeader({ alg: "RS256", typ: "logout+jwt", kid: "k1" })
      .setIssuer(ISSUER).setAudience(CLIENT).setIssuedAt().setExpirationTime("2m").setJti(randomUUID())
      .sign(other.privateKey);
    await assert.rejects(() => svc.backchannelLogout(forged), /invalid logout token/);
    await assert.rejects(() => svc.backchannelLogout(undefined), /missing logout_token/);
  });

  it("subject.deleted by sub revokes all sessions and removes the link", async () => {
    await prisma.kiorexIdentityLink.create({ data: { userId, issuer: ISSUER, subject: "kx-sub-del", linkedVia: "PASSWORD_REAUTH" } });
    const s = await sessions.createSession(userId);
    const tok = await new SignJWT({
      events: {
        "http://schemas.openid.net/event/backchannel-logout": {},
        "https://schemas.kiorex.com/event/subject.deleted": {},
      },
      sub: "kx-sub-del",
    })
      .setProtectedHeader({ alg: "RS256", typ: "logout+jwt", kid: "k1" })
      .setIssuer(ISSUER).setAudience(CLIENT).setIssuedAt().setExpirationTime("2m").setJti(randomUUID())
      .sign(privateKey);
    const r = await svc.backchannelLogout(tok);
    assert.ok(r.revoked >= 1);
    assert.ok((await prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } })).revokedAt);
    assert.equal(await prisma.kiorexIdentityLink.count({ where: { subject: "kx-sub-del" } }), 0);
  });
});
