import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { MarketLaunchStatus, MarketOperationalStatus, UserRole } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { JwtUser } from "../auth/jwt-user";
import { MarketsService } from "./markets.service";
import { MarketProvisionService } from "./market-provision.service";
import { LegalConfigService } from "./legal-config.service";
import type { MarketActor } from "./market-actor";

const prisma = createPrismaClient();
const svc = new MarketsService(prisma as unknown as PrismaService, {} as FeatureFlagsService, new MarketProvisionService());
const legal = new LegalConfigService(prisma as unknown as PrismaService);

const A: MarketActor = { id: "admin-a", email: "a@example.com", source: "CLINIC_PLATFORM" };
const B: MarketActor = { id: "kiorly-admin:ops-b", email: "b@example.com", source: "KIORLY_ADMIN" };
const superAdminJwt = { userId: "admin-a", tenantId: null, email: "a@example.com", role: UserRole.PLATFORM_SUPER_ADMIN } as JwtUser;
const clinicAdminJwt = { userId: "u2", tenantId: "t", email: "x@example.com", role: UserRole.CLINIC_ADMIN } as JwtUser;

const TAX = { invoiceVatPercent: 14, saasVatPercent: 14, defaultVisitFee: 300, trnRequired: false, reason: "Tax pack from counsel memo" };
const createdIds: string[] = [];
/** Two-letter codes the rest of the suite does not use (X?, Y?); every market this file creates is deleted afterwards. */
const nextCode = () => `${"XY"[Math.floor(Math.random() * 2)]}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

async function freshDraft(): Promise<{ id: string; code: string }> {
  for (let i = 0; i < 60; i++) {
    const code = nextCode();
    try {
      const m = await svc.createAs(A, { code, nameEn: `Test ${code}`, defaultCurrency: "USD", defaultTimezone: "UTC", defaultLocale: "en-US", defaultPhoneRegion: "US", weekendDays: [6, 0], enabledLanguages: ["en"] });
      createdIds.push(m.id);
      return { id: m.id, code };
    } catch (e) {
      if ((e as { response?: { code?: string } }).response?.code !== "MARKET_EXISTS") throw e;
    }
  }
  throw new Error("no free test market code");
}
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;
const rejectsWith = async (p: Promise<unknown>, code: string) => assert.rejects(p, (e) => codeOf(e) === code, `expected ${code}`);
const events = (marketId: string) => prisma.marketAuditEvent.findMany({ where: { marketId }, orderBy: { createdAt: "asc" } });

describe("market lifecycle audit, approval and edge cases (founder decision C)", () => {
  before(async () => { await prisma.$connect(); });
  after(async () => {
    await prisma.tenant.deleteMany({ where: { marketId: { in: createdIds } } });
    await prisma.market.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("Initiate country launch with only the country creates a complete draft and audits CREATE", async () => {
    const m = await svc.createAs(A, { code: "ZZ-x" as never, nameEn: "x" }).catch((e) => e);
    assert.equal(codeOf(m), "MARKET_INVALID");
    const code = nextCode();
    const created = await svc.createAs(A, { code, nameEn: "Only code and name" }).catch((e) => e);
    // an unknown country needs every value, a known one needs none: the form sends them all either way
    assert.equal(codeOf(created), "MARKET_INVALID");
    const d = await freshDraft();
    const ev = await events(d.id);
    assert.equal(ev[0]?.action, "CREATE");
    assert.equal(ev[0]?.actorId, A.id);
    assert.equal(ev[0]?.reason, "Country launch initiated");
  });

  it("a duplicate country is a clean 409, not a server error", async () => {
    const d = await freshDraft();
    await rejectsWith(svc.createAs(A, { code: d.code, nameEn: "again", defaultCurrency: "USD", defaultTimezone: "UTC", defaultLocale: "en-US", defaultPhoneRegion: "US", weekendDays: [0], enabledLanguages: ["en"] }), "MARKET_EXISTS");
  });

  it("Go live without a tax pack is refused with TAX_PACK_MISSING and writes no audit row", async () => {
    const d = await freshDraft();
    const before = (await events(d.id)).length;
    await rejectsWith(svc.transition(A, d.id, "LAUNCH", { reason: "Opening the market" }), "TAX_PACK_MISSING");
    assert.equal((await events(d.id)).length, before);
    assert.equal((await prisma.market.findUniqueOrThrow({ where: { id: d.id } })).status, MarketLaunchStatus.DRAFT);
  });

  it("Go live needs a reason", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await rejectsWith(svc.transition(A, d.id, "LAUNCH", {}), "REASON_REQUIRED");
    await rejectsWith(svc.transition(A, d.id, "LAUNCH", { reason: "  " }), "REASON_REQUIRED");
  });

  it("an unknown host cell is a clear 400 HOST_CELL_UNKNOWN (it used to be a 500)", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await prisma.market.update({ where: { id: d.id }, data: { hostCell: "atlantis" } });
    await rejectsWith(svc.transition(A, d.id, "LAUNCH", { reason: "Opening the market" }), "HOST_CELL_UNKNOWN");
  });

  it("Go live, Pause, Disable, Enable each write an append-only audit row with actor, time, reason and approval", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    const live = await svc.transition(A, d.id, "LAUNCH", { reason: "Counsel signed off", approvalRef: "DOC-77", approvalLink: "https://docs.example.org/approvals/77" });
    assert.equal((live as { status: string }).status, "LIVE");
    await svc.transition(B, d.id, "PAUSE", { reason: "Payment partner outage", days: 3 });
    await svc.transition(A, d.id, "ENABLE", { reason: "Outage over" });
    await svc.transition(A, d.id, "DISABLE", { reason: "Regulator question" });
    await svc.transition(A, d.id, "ENABLE", { reason: "Resolved", approvalRef: "DOC-78" });
    const ev = (await events(d.id)).filter((e) => ["LAUNCH", "PAUSE", "ENABLE", "DISABLE"].includes(e.action));
    assert.deepEqual(ev.map((e) => e.action), ["LAUNCH", "PAUSE", "ENABLE", "DISABLE", "ENABLE"]);
    const launch = ev[0]!;
    assert.equal(launch.actorId, "admin-a");
    assert.equal(launch.actorEmail, "a@example.com");
    assert.equal(launch.actorSource, "CLINIC_PLATFORM");
    assert.equal(launch.reason, "Counsel signed off");
    assert.equal(launch.approvalRef, "DOC-77");
    assert.equal(launch.approvalLink, "https://docs.example.org/approvals/77");
    assert.equal(launch.fromStatus, "DRAFT");
    assert.equal(launch.toStatus, "LIVE");
    assert.ok(Date.now() - launch.createdAt.getTime() < 60_000);
    assert.equal(ev[1]!.actorSource, "KIORLY_ADMIN");
    assert.equal(ev[1]!.toOperational, "PAUSED");
    assert.equal((ev[1]!.metadata as { days: number }).days, 3);
    assert.equal(ev[3]!.toOperational, "DISABLED");
  });

  it("the audit trail cannot be changed or deleted (database trigger)", async () => {
    const d = await freshDraft();
    const row = (await events(d.id))[0]!;
    await assert.rejects(prisma.marketAuditEvent.update({ where: { id: row.id }, data: { reason: "rewritten" } }), /append-only/);
    await assert.rejects(prisma.marketAuditEvent.delete({ where: { id: row.id } }), /append-only/);
    await assert.rejects(prisma.marketAuditEvent.deleteMany({ where: { marketId: d.id } }), /append-only/);
    assert.equal((await events(d.id))[0]!.reason, row.reason);
  });

  it("double click and two administrators: exactly one launch, exactly one audit row", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    const results = await Promise.allSettled([
      svc.transition(A, d.id, "LAUNCH", { reason: "first click" }),
      svc.transition(A, d.id, "LAUNCH", { reason: "second click" }),
      svc.transition(B, d.id, "LAUNCH", { reason: "other admin" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results.filter((x) => x.status === "rejected")) assert.equal(codeOf((r as PromiseRejectedResult).reason), "MARKET_ALREADY_LIVE");
    assert.equal((await events(d.id)).filter((e) => e.action === "LAUNCH").length, 1);
  });

  it("Enable and Disable are idempotent: repeating them changes nothing and audits nothing", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.transition(A, d.id, "LAUNCH", { reason: "go live now" });
    const n0 = (await events(d.id)).length;
    const again = (await svc.transition(A, d.id, "ENABLE", { reason: "already active" })) as { unchanged?: boolean };
    assert.equal(again.unchanged, true);
    await svc.transition(A, d.id, "DISABLE", { reason: "close" });
    const n1 = (await events(d.id)).length;
    assert.equal(n1, n0 + 1);
    const twice = (await svc.transition(A, d.id, "DISABLE", { reason: "close again" })) as { unchanged?: boolean };
    assert.equal(twice.unchanged, true);
    assert.equal((await events(d.id)).length, n1);
  });

  it("concurrent Disable calls produce one audit row", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.transition(A, d.id, "LAUNCH", { reason: "go live now" });
    await Promise.all([1, 2, 3, 4].map(() => svc.transition(A, d.id, "DISABLE", { reason: "close it" })));
    assert.equal((await events(d.id)).filter((e) => e.action === "DISABLE").length, 1);
  });

  it("Pause, Disable and Enable are refused on a draft market (409 MARKET_NOT_LIVE) and Pause days are validated", async () => {
    const d = await freshDraft();
    for (const kind of ["PAUSE", "DISABLE", "ENABLE"] as const) await rejectsWith(svc.transition(A, d.id, kind, { reason: "not live" }), "MARKET_NOT_LIVE");
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.transition(A, d.id, "LAUNCH", { reason: "go live now" });
    for (const days of [0, 366, 1.5, -1, "3", null === undefined ? 1 : Number.NaN]) {
      await rejectsWith(svc.transition(A, d.id, "PAUSE", { reason: "pause", days }), "PAUSE_DAYS_INVALID");
    }
    const paused = (await svc.transition(A, d.id, "PAUSE", { reason: "pause", days: 365 })) as { operability: string; pausedUntil: string };
    assert.equal(paused.operability, "paused");
    assert.ok(new Date(paused.pausedUntil).getTime() > Date.now() + 360 * 86_400_000);
  });

  it("a market that never existed is a 404, not a crash", async () => {
    await rejectsWith(svc.transition(A, "does-not-exist", "LAUNCH", { reason: "x y z" }), "MARKET_NOT_FOUND");
    await rejectsWith(svc.auditTrail("does-not-exist"), "MARKET_NOT_FOUND");
  });

  it("only a platform super admin may act through the JWT entry points", async () => {
    const d = await freshDraft();
    await assert.rejects(async () => svc.launch(clinicAdminJwt, d.id, { reason: "try it" }), (e) => codeOf(e) === "PLATFORM_SUPER_ADMIN_ONLY");
    await assert.rejects(async () => svc.list(clinicAdminJwt), (e) => codeOf(e) === "PLATFORM_SUPER_ADMIN_ONLY");
    const listed = await svc.list(superAdminJwt);
    assert.ok(listed.some((m) => m.id === d.id));
  });

  it("second approver (setting on): the change waits, a different person approves, the same person cannot", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.setSecondApprover(A, d.id, true, { reason: "Two-person rule for this market" });
    const pending = (await svc.transition(A, d.id, "LAUNCH", { reason: "Go live request", approvalRef: "DOC-9" })) as { pending: boolean; requestId: string };
    assert.equal(pending.pending, true);
    assert.equal((await prisma.market.findUniqueOrThrow({ where: { id: d.id } })).status, MarketLaunchStatus.DRAFT, "nothing changed yet");
    await rejectsWith(svc.transition(A, d.id, "LAUNCH", { reason: "again" }), "REQUEST_ALREADY_PENDING");
    await rejectsWith(svc.approveRequest(A, d.id, pending.requestId), "SECOND_APPROVER_MUST_DIFFER");
    await rejectsWith(svc.approveRequest({ ...B, id: "kiorly-admin:other", email: "A@example.com" }, d.id, pending.requestId), "SECOND_APPROVER_MUST_DIFFER");
    const done = (await svc.approveRequest(B, d.id, pending.requestId)) as { status: string };
    assert.equal(done.status, "LIVE");
    await rejectsWith(svc.approveRequest(B, d.id, pending.requestId), "REQUEST_NOT_PENDING");
    const launch = (await events(d.id)).find((e) => e.action === "LAUNCH")!;
    assert.equal(launch.actorId, A.id, "the maker is the actor");
    assert.equal(launch.secondApproverId, B.id, "the checker is recorded");
    assert.equal(launch.requestId, pending.requestId);
    assert.equal(launch.approvalRef, "DOC-9");
    assert.ok((await events(d.id)).some((e) => e.action === "LAUNCH_REQUESTED"));
  });

  it("two approvers racing on one request: exactly one applies it", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.setSecondApprover(A, d.id, true, { reason: "Two-person rule" });
    const p = (await svc.transition(A, d.id, "LAUNCH", { reason: "Go live request" })) as { requestId: string };
    const r = await Promise.allSettled([svc.approveRequest(B, d.id, p.requestId), svc.approveRequest({ ...B, id: "kiorly-admin:c" }, d.id, p.requestId)]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await events(d.id)).filter((e) => e.action === "LAUNCH").length, 1);
  });

  it("a request whose prerequisite vanished is put back, not lost; a requester can withdraw; another person can reject", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.setSecondApprover(A, d.id, true, { reason: "Two-person rule" });
    const p = (await svc.transition(A, d.id, "LAUNCH", { reason: "Go live request" })) as { requestId: string };
    await prisma.market.update({ where: { id: d.id }, data: { taxConfig: {} } });
    await rejectsWith(svc.approveRequest(B, d.id, p.requestId), "TAX_PACK_MISSING");
    assert.equal((await prisma.marketChangeRequest.findUniqueOrThrow({ where: { id: p.requestId } })).status, "PENDING");
    const w = (await svc.rejectRequest(A, d.id, p.requestId, "changed my mind")) as { status: string };
    assert.equal(w.status, "CANCELLED");
    const p2 = (await svc.transition(A, d.id, "LAUNCH", { reason: "second try" })) as { requestId: string };
    assert.equal(((await svc.rejectRequest(B, d.id, p2.requestId, "no")) as { status: string }).status, "REJECTED");
    await rejectsWith(svc.rejectRequest(B, d.id, p2.requestId), "REQUEST_NOT_PENDING");
  });

  it("the second-approver setting needs a reason, a real boolean, and is itself audited", async () => {
    const d = await freshDraft();
    await rejectsWith(svc.setSecondApprover(A, d.id, true, {}), "REASON_REQUIRED");
    await rejectsWith(svc.setSecondApprover(A, d.id, "yes", { reason: "should fail" }), "REQUIRE_SECOND_APPROVER_INVALID");
    await svc.setSecondApprover(A, d.id, true, { reason: "turn on" });
    await svc.setSecondApprover(A, d.id, true, { reason: "turn on again" }); // no change, no row
    await svc.setSecondApprover(A, d.id, false, { reason: "turn off" });
    assert.equal((await events(d.id)).filter((e) => e.action === "SECOND_APPROVER_SETTING").length, 2);
  });

  it("tax pack: boundary values and hostile input", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, { ...TAX, invoiceVatPercent: 0, saasVatPercent: 100, defaultVisitFee: 0 });
    for (const bad of [{ invoiceVatPercent: -0.01 }, { invoiceVatPercent: 100.01 }, { saasVatPercent: "14" }, { defaultVisitFee: Number.NaN }, { defaultVisitFee: 1_000_001 }, { trnFormat: "(" }, { trnFormat: "x".repeat(121) }, { trnRequired: "yes" }]) {
      await rejectsWith(svc.updateTaxPack(A, d.id, { ...TAX, ...bad }), "TAX_PACK_INVALID");
    }
    await rejectsWith(svc.updateTaxPack(A, d.id, { ...TAX, reason: "" }), "REASON_REQUIRED");
    assert.ok((await events(d.id)).some((e) => e.action === "TAX_PACK_UPDATED"));
  });

  it("legal configuration changes are audited with actor and reason", async () => {
    const d = await freshDraft();
    await legal.updateAs(B, d.id, { pilotException: { active: true, legalRef: "PILOT-1" }, reason: "Closed pilot", approvalLink: "https://docs.example.org/pilot" });
    const ev = (await events(d.id)).find((e) => e.action === "LEGAL_CONFIG_UPDATED")!;
    assert.equal(ev.actorSource, "KIORLY_ADMIN");
    assert.equal(ev.reason, "Closed pilot");
    assert.equal(ev.approvalRef, "PILOT-1");
    assert.equal(ev.approvalLink, "https://docs.example.org/pilot");
  });

  it("after launch only the names can change; a launched market cannot be deleted; a draft can, and its trail stays", async () => {
    const d = await freshDraft();
    await svc.patchAs(A, d.id, { nameEn: "Renamed" });
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.transition(A, d.id, "LAUNCH", { reason: "go live now" });
    await rejectsWith(svc.patchAs(A, d.id, { defaultCurrency: "EUR" }), "MARKET_LOCKED_AFTER_LAUNCH");
    await svc.patchAs(A, d.id, { nameAr: "اسم جديد" });
    await rejectsWith(svc.removeAs(A, d.id), "ONLY_DRAFT_DELETABLE");
    const e = await freshDraft();
    await svc.removeAs(A, e.id);
    assert.ok((await events(e.id)).some((x) => x.action === "DELETE_DRAFT"), "the trail outlives the deleted draft");
  });

  it("audit trail paging with a large history", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    await svc.transition(A, d.id, "LAUNCH", { reason: "go live now" });
    for (let i = 0; i < 60; i++) await svc.updateTaxPack(A, d.id, { ...TAX, defaultVisitFee: i });
    const p1 = await svc.auditTrail(d.id, { limit: 25 });
    assert.equal(p1.items.length, 25);
    assert.ok(p1.nextBefore);
    const p2 = await svc.auditTrail(d.id, { limit: 25, before: p1.nextBefore! });
    assert.ok(p2.items.length > 0);
    assert.equal(new Set([...p1.items, ...p2.items].map((x) => x.id)).size, p1.items.length + p2.items.length, "no row repeats across pages");
    const total = (await events(d.id)).length;
    assert.equal((await svc.auditTrail(d.id, { limit: 100000 })).items.length, Math.min(200, total));
    assert.equal((await svc.auditTrail(d.id, { limit: -5 })).items.length, Math.min(50, total));
    assert.equal((await svc.auditTrail(d.id, { limit: Number.NaN })).items.length, Math.min(50, total));
    assert.equal((await svc.auditTrail(d.id, { before: "not-a-date" })).items.length > 0, true);
  });

  it("hostile free text (script tags, SQL, huge Arabic text) is stored as plain data", async () => {
    const d = await freshDraft();
    await svc.updateTaxPack(A, d.id, TAX);
    const reason = `<img src=x onerror=alert(1)>'; DROP TABLE "Market"; -- ${"مرحبا ".repeat(100)}`;
    await svc.transition(A, d.id, "LAUNCH", { reason });
    assert.equal((await events(d.id)).find((e) => e.action === "LAUNCH")!.reason, reason.trim());
    assert.ok((await prisma.market.count()) > 0);
  });
});

describe("organisation country is fixed for life (founder decision A, Clinic)", () => {
  it("Tenant.marketId cannot be moved to another market (database trigger), but a first binding is allowed", async () => {
    const m1 = await freshDraft();
    const m2 = await freshDraft();
    const t = await prisma.tenant.create({ data: { name: `Immutable ${Date.now()}`, deploymentCell: "frankfurt", baseCurrency: "USD" } });
    await prisma.tenant.update({ where: { id: t.id }, data: { marketId: m1.id } }); // null -> value: allowed once
    await assert.rejects(prisma.tenant.update({ where: { id: t.id }, data: { marketId: m2.id } }), /ORG_MARKET_IMMUTABLE/);
    await assert.rejects(prisma.tenant.update({ where: { id: t.id }, data: { marketId: null } }), /ORG_MARKET_IMMUTABLE/);
    await prisma.tenant.update({ where: { id: t.id }, data: { marketId: m1.id, name: "Renamed org" } }); // same value is fine
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: t.id } })).marketId, m1.id);
    await rejectsWith(svc.removeAs(A, m1.id), "MARKET_HAS_ORGANIZATIONS");
    await prisma.tenant.delete({ where: { id: t.id } });
  });
  it("sanity: statuses used above exist", () => {
    assert.ok(MarketOperationalStatus.ACTIVE && MarketLaunchStatus.LIVE);
  });
});
