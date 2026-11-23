import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { KiorexBearerService, normalizePhone, readBearerConfig } from "./kiorex-bearer.service";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

let server: http.Server; let issuer = ""; let priv: CryptoKey; let jwk: JWK;
const sign = (claims: Record<string, unknown>, aud = "kiorex-api", over: { iss?: string; sub?: string } = {}) =>
  new SignJWT({ client_id: "kiorly-team", phone_number: "+201000002001", phone_number_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(over.iss ?? issuer).setAudience(aud).setSubject(over.sub ?? "SUB-1").setIssuedAt().setExpirationTime("10m").sign(priv);

before(async () => {
  const kp = await generateKeyPair("RS256", { extractable: true });
  priv = kp.privateKey as CryptoKey; jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  server = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(req.url === "/jwks" ? JSON.stringify({ keys: [jwk] }) : "{}"); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());
const on = () => { process.env.NODE_ENV = "test"; process.env.KIOREX_OIDC_ISSUER = issuer; delete process.env.KIOREX_OIDC_ACCEPT_BEARER; };

type Row = Record<string, unknown>;
function svc(opts: { links?: Row[]; employees?: Row[]; user?: Row | null } = {}) {
  const links = opts.links ?? []; const audits: unknown[] = []; const created: Row[] = [];
  const prisma = {
    kiorexIdentityLink: {
      findUnique: async ({ where }: { where: { issuer_subject: { subject: string } } }) => links.find((l) => l.subject === where.issuer_subject.subject) ?? null,
      create: async ({ data }: { data: Row }) => { created.push(data); links.push(data); return data; },
    },
    employee: { findMany: async ({ where }: { where: { phone: { in: string[] } } }) => (opts.employees ?? []).filter((e) => where.phone.in.includes(e.phone as string)) },
    user: { findFirst: async () => (opts.user === undefined ? { id: "u1", tenantId: "t1", email: "a@b.c", role: "RECEPTIONIST", additionalRoles: [], isTenantOwner: false, mfaEnabled: false } : opts.user) },
  };
  return { s: new KiorexBearerService(prisma as never, { recordEvent: async (e: unknown) => { audits.push(e); } } as never), audits, created };
}
const emp = (over: Row = {}) => ({ userId: "u1", phone: "+201000002001", user: { tenantId: "t1" }, ...over });

describe("Passport bearer config", () => {
  it("needs an issuer; production needs an explicit opt-in; phone linking is off in production by default", () => {
    assert.equal(readBearerConfig({} as never), null);
    assert.ok(readBearerConfig({ KIOREX_OIDC_ISSUER: "http://i/" } as never));
    assert.equal(readBearerConfig({ KIOREX_OIDC_ISSUER: "http://i", KIOREX_OIDC_ACCEPT_BEARER: "false" } as never), null);
    assert.equal(readBearerConfig({ KIOREX_OIDC_ISSUER: "http://i", NODE_ENV: "production" } as never), null);
    assert.equal(readBearerConfig({ KIOREX_OIDC_ISSUER: "http://i", NODE_ENV: "production", AUTH_MODE: "oidc" } as never)!.phoneLink, false);
    assert.equal(normalizePhone("+20 100 000-2001"), "+201000002001");
  });
});

describe("Passport bearer authentication", () => {
  it("maps a linked subject to the user (role from our row, not from the token)", async () => {
    on();
    const { s } = svc({ links: [{ subject: "SUB-1", userId: "u1" }] });
    const t = await sign({ kx_roles: ["super_admin"], role: "GROUP_ADMIN" });
    assert.equal(s.accepts(t), true);
    const u = await s.authenticate(t);
    assert.deepEqual([u.userId, u.role, u.tenantId], ["u1", "RECEPTIONIST", "t1"]);
  });
  it("first login links the unique staff member by verified phone (audited); an HS256 product token is not claimed", async () => {
    on();
    const { s, audits, created } = svc({ employees: [emp()] });
    await s.authenticate(await sign({}));
    assert.equal(created.length, 1); assert.equal(created[0]!.linkedVia, "PHONE_MATCH"); assert.equal(audits.length, 1);
    const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("x".repeat(32)));
    assert.equal(s.accepts(hs), false);
  });
  it("matches an Employee.phone saved by the HR screen (digits only, no +) as well as the E.164 form", async () => {
    on();
    const digits = svc({ employees: [emp({ phone: "201000002001" })] });
    await digits.s.authenticate(await sign({}));
    assert.equal(digits.created.length, 1);
    // another country's number with the same trailing digits must not match
    const { s } = svc({ employees: [emp({ phone: "101000002001" })] });
    await assert.rejects(s.authenticate(await sign({})), (e: { getResponse?: () => { errorCode?: string } }) => e.getResponse?.().errorCode === "PASSPORT_NOT_LINKED");
  });
  it("refuses unverified phones, ambiguous matches, unknown phones, other clients, audiences and issuers", async () => {
    on();
    const rej = async (s: KiorexBearerService, t: string, code?: string) => assert.rejects(s.authenticate(t), (e: { getResponse?: () => { errorCode?: string } }) => code === undefined || e.getResponse?.().errorCode === code);
    await rej(svc({ employees: [emp()] }).s, await sign({ phone_number_verified: false }), "PASSPORT_NOT_LINKED");
    await rej(svc({ employees: [emp(), emp({ userId: "u2" })] }).s, await sign({}), "PASSPORT_NOT_LINKED");
    await rej(svc({ employees: [emp({ phone: "+201999999999" })] }).s, await sign({}), "PASSPORT_NOT_LINKED");
    await rej(svc({ employees: [emp()] }).s, await sign({ client_id: "kiorex-web" }));
    await rej(svc({ employees: [emp()] }).s, await sign({}, "other-api"));
    await rej(svc({ employees: [emp()] }).s, await sign({}, "kiorex-api", { iss: "http://evil" }));
  });
  it("a user with an enrolled second factor needs an MFA assurance in the Passport token (SC-04)", async () => {
    on();
    const mfaUser = { id: "u1", tenantId: "t1", email: "a@b.c", role: "GROUP_ADMIN", additionalRoles: [], isTenantOwner: true, mfaEnabled: true };
    const mk = () => svc({ links: [{ subject: "SUB-1", userId: "u1" }], user: mfaUser }).s;
    await assert.rejects(mk().authenticate(await sign({})), (e: { getResponse?: () => { errorCode?: string } }) => e.getResponse?.().errorCode === "MFA_REQUIRED");
    assert.equal((await mk().authenticate(await sign({ acr: "urn:kiorex:acr:mfa" }))).userId, "u1");
  });
  it("a deactivated or deleted user is refused", async () => {
    on();
    await assert.rejects(svc({ links: [{ subject: "SUB-1", userId: "u1" }], user: null }).s.authenticate(await sign({})));
  });
});
