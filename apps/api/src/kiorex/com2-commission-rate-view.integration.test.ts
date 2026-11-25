import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { CommissionCollectionsService } from "./commission-collections.service";

const prisma = createPrismaClient();
const svcPrisma = prisma as unknown as PrismaService;
const sfx = `com2-${Date.now()}`;

/** COM-2 provider side: Kiorex pushes the organisation's rate view; admin / finance read it (read only); isolation and idempotency. Every rate is a TEST placeholder. */
describe("COM-2 commission rate view (Clinic)", () => {
  let marketId = ""; let svc: CommissionCollectionsService;
  const tenants: string[] = [];
  const mkOrg = async (tag: string) => {
    const tenant = await prisma.tenant.create({ data: { name: `COM2 ${tag} ${sfx}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
    tenants.push(tenant.id);
    const mk = (role: UserRole, n: string) => prisma.user.create({ data: { tenantId: tenant.id, email: `${n}-${tag}-${sfx}@t.com`, passwordHash: "x", displayName: n, role } });
    const fin = await mk(UserRole.FINANCE_OFFICER, "fin"); const rec = await mk(UserRole.RECEPTIONIST, "rec");
    const u = (id: string, role: UserRole) => ({ userId: id, tenantId: tenant.id, email: "x", role });
    return { tenantId: tenant.id, finance: u(fin.id, UserRole.FINANCE_OFFICER), reception: u(rec.id, UserRole.RECEPTIONIST) };
  };
  const spec = (o: object = {}) => ({ feeType: "PERCENT", percentBps: 1250, flatMinor: null, minMinor: 500, maxMinor: 9000, mode: null, ...o });
  const view = (orgRef: string, version: string, history: object[]) => ({ orgRef, product: "CLINIC", version, history });
  const def = (version: number, from: string, s: object = spec()) => ({ version, scope: "DEFAULT", kind: "RATE", effectiveFrom: from, reason: null, spec: s });
  let a: Awaited<ReturnType<typeof mkOrg>>; let b: Awaited<ReturnType<typeof mkOrg>>;

  before(async () => {
    await prisma.$connect();
    svc = new CommissionCollectionsService(svcPrisma);
    const m = await prisma.market.create({ data: { code: `R${Date.now().toString(36)}`.toUpperCase().slice(0, 8), nameEn: `COM2 ${sfx}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } });
    marketId = m.id;
    a = await mkOrg("a"); b = await mkOrg("b");
  });
  after(async () => {
    for (const id of tenants) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("before Kiorex reports anything the page says 'rate not set' (no invented rate)", async () => {
    const r = await svc.rate(a.finance as never, a.tenantId);
    assert.deepEqual([r.known, r.state, r.effective.spec, r.inheriting], [false, "NOT_SET", null, true]);
  });

  it("ingest is idempotent, the newest version wins, a malformed or foreign view is refused", async () => {
    assert.equal((await svc.ingestRate(view(a.tenantId, "100", [def(1, "2026-01-01T00:00:00Z")]))).applied, true);
    assert.equal((await svc.ingestRate(view(a.tenantId, "100", [def(1, "2026-01-01T00:00:00Z", spec({ percentBps: 9999 }))]))).applied, false);
    assert.equal((await svc.ingestRate(view(a.tenantId, "90", []))).applied, false);
    const now = await svc.rate(a.finance as never, a.tenantId);
    assert.equal(now.effective.spec?.percentBps, 1250);
    await assert.rejects(() => svc.ingestRate({ ...view(a.tenantId, "200", []), product: "HOTEL" }), (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code === "INVALID_RATE_VIEW");
    await assert.rejects(() => svc.ingestRate(view("no_such_tenant", "200", [])), /not found/);
  });

  it("shows default, override, effective and history; a future change is 'upcoming'; the override reason is visible", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await svc.ingestRate(view(a.tenantId, "300", [
      def(1, "2026-01-01T00:00:00Z"),
      { version: 1, scope: "ORG", kind: "RATE", effectiveFrom: "2026-03-01T00:00:00Z", reason: "negotiated", spec: spec({ feeType: "FLAT", percentBps: null, flatMinor: 4000, mode: "NET_FROM_PAYOUT" }) },
      def(2, future, spec({ percentBps: 2000 })),
    ]));
    const r = await svc.rate(a.finance as never, a.tenantId);
    assert.equal(r.effective.source, "OVERRIDE"); assert.equal(r.effective.reason, "negotiated"); assert.equal(r.inheriting, false);
    assert.equal(r.default.spec?.percentBps, 1250);
    assert.equal(r.upcoming?.version, 2);
    assert.equal(r.history.length, 3);
    assert.equal(r.history[0]!.effectiveFrom, future); // newest first
    // an old instant keeps the old rate
    const old = await svc.rate(a.finance as never, a.tenantId, new Date("2026-02-01T00:00:00Z"));
    assert.equal(old.effective.source, "DEFAULT");
  });

  it("only users who may see commission figures read it, and only their own organisation's", async () => {
    await assert.rejects(() => svc.rate(a.reception as never, a.tenantId), /Kiorex commission figures are visible/);
    await svc.ingestRate(view(b.tenantId, "10", [def(1, "2026-01-01T00:00:00Z", spec({ percentBps: 700 }))]));
    const rb = await svc.rate(b.finance as never, b.tenantId);
    assert.equal(rb.effective.spec?.percentBps, 700);
    // tenant B's finance user cannot read tenant A through a spoofed tenant id
    await assert.rejects(() => svc.rate(b.finance as never, a.tenantId), /Kiorex commission figures are visible/);
  });
});
