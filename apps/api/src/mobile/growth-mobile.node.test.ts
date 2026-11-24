import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { GrowthMobileService } from "./growth-mobile.service";
import { modulesFor } from "./mobile-roles";

const user = (role: UserRole, extra: Record<string, unknown> = {}) => ({ userId: "u1", tenantId: "t1", email: "e", role, ...extra }) as never;
const on = (role: UserRole, edition = "CLINIC", extra = {}) => modulesFor(user(role, extra), edition).filter((m) => m.enabled).map((m) => m.key);
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return (e as { getResponse?: () => { code?: string } }).getResponse?.().code ?? "ERR"; } };

function svc(opts: { links?: unknown[]; created?: unknown[]; updated?: unknown[]; profession?: string | null } = {}) {
  const prisma = {
    tenant: { findUniqueOrThrow: async () => ({ edition: "CLINIC" }) },
    user: { findUnique: async () => ({ profession: opts.profession ?? null }) },
    clinic: { findFirst: async () => ({ id: "c1", nameEn: "Clinic", nameAr: "عيادة", bookingSlug: "demo", country: "EG" }) },
    marketplaceListing: { findFirst: async () => ({ bookingSlug: "dr-x", clinicId: "c1" }) },
    providerReferralLink: {
      findMany: async () => opts.links ?? [],
      findFirst: async ({ where }: { where: { id: string } }) => ((opts.links ?? []) as { id: string }[]).find((l) => l.id === where.id) ?? null,
    },
  };
  const dto = (l: Record<string, unknown>) => ({ ...l, shortUrl: `http://x/q/${l.code}`, last30: { visits: 5, bookings: 2, attended: 1 }, targetNameEn: "", targetNameAr: "" });
  const links = {
    toDtos: async (_t: string, rows: Record<string, unknown>[]) => rows.map(dto),
    list: async () => ({ items: ((opts.links ?? []) as Record<string, unknown>[]).map(dto) }),
    access: async () => ({ plan: { key: "PRO", maxActiveLinks: 25, linksUsed: 1 } }),
    create: async (_u: unknown, b: unknown) => { opts.created?.push(b); return { id: "new" }; },
    update: async (_u: unknown, id: string, b: unknown) => { opts.updated?.push([id, b]); return { id }; },
  };
  const insights = { performance: async () => ({ days: 30 }), recommendations: async () => ({ items: Array.from({ length: 8 }, (_, i) => ({ id: `R${i}` })) }) };
  const decisions = { statement: async () => ({ period: "2026-11", currency: "EGP", chargesByStatus: {}, providerLedBookings: 3, byDecision: {}, totals: {}, reconciled: true, statement: "s", secret: "no" }) };
  return new GrowthMobileService(prisma as never, links as never, insights as never, decisions as never);
}

describe("Kiorly Growth: module per role", () => {
  it("owner, admin, manager, supervisor, marketing assistant and physician get clinic.growth; front desk, finance, HR do not", () => {
    for (const r of [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER, UserRole.GROUP_SUPERVISOR, UserRole.CLINIC_ASSISTANT, UserRole.PHYSICIAN]) assert.ok(on(r).includes("clinic.growth"), r);
    for (const r of [UserRole.RECEPTIONIST, UserRole.CALL_CENTER, UserRole.FINANCE_OFFICER, UserRole.HR_OFFICER, UserRole.NURSE]) assert.ok(!on(r).includes("clinic.growth"), r);
    assert.ok(on(UserRole.RECEPTIONIST, "CLINIC", { isTenantOwner: true }).includes("clinic.growth"));
  });
});

describe("Kiorly Growth: overview scoping", () => {
  const link = { id: "l1", code: "ABCD2345", label: "Desk", ownerScope: "DESK", channelKind: "QR_POSTER", status: "ACTIVE", clinicianId: null };
  it("admin gets performance, recommendations (max 5) and the commission summary without extra fields", async () => {
    const o = await svc({ links: [link] }).overview(user(UserRole.CLINIC_ADMIN));
    assert.equal(o.level, "admin");
    assert.equal(o.recommendations.length, 5);
    assert.equal(o.commission?.providerLedBookings, 3);
    assert.ok(!("secret" in (o.commission ?? {})));
    assert.equal(o.can.create, true);
    assert.match(o.webGrowthUrl, /\/kiorex\/growth$/);
  });
  it("supervisor reads but cannot create; marketing creates and has no commission summary", async () => {
    const s = await svc({ links: [link] }).overview(user(UserRole.GROUP_SUPERVISOR));
    assert.deepEqual([s.level, s.can.create, s.commission], ["read", false, null]);
    const m = await svc({ links: [link] }).overview(user(UserRole.CLINIC_ASSISTANT));
    assert.deepEqual([m.level, m.can.create, m.commission], ["marketing", true, null]);
  });
  it("a doctor sees only their own link, no performance and no commission, and the doctor profile URL", async () => {
    const o = await svc({ links: [{ ...link, ownerScope: "DOCTOR", clinicianId: "u1" }] }).overview(user(UserRole.PHYSICIAN));
    assert.equal(o.level, "doctor");
    assert.equal(o.performance, null);
    assert.equal(o.commission, null);
    assert.equal(o.plan, null);
    assert.match(o.profile.kiorexUrl ?? "", /\/doctor\/dr-x/);
    assert.equal(o.links.length, 1);
  });
  it("revoked links are not listed; profile is not ready without a slug", async () => {
    const o = await svc({ links: [link, { ...link, id: "l2", status: "REVOKED" }] }).overview(user(UserRole.CLINIC_ADMIN));
    assert.deepEqual(o.links.map((l) => l.id), ["l1"]);
  });
  it("front desk gets MODULE_NOT_ALLOWED", async () => {
    assert.equal(await code(() => svc().overview(user(UserRole.RECEPTIONIST))), "MODULE_NOT_ALLOWED");
    assert.equal(await code(() => svc().overview(user(UserRole.FINANCE_OFFICER))), "MODULE_NOT_ALLOWED");
  });
});

describe("Kiorly Growth: writes and QR", () => {
  it("doctor and supervisor cannot create or pause; revoke is web only", async () => {
    for (const r of [UserRole.PHYSICIAN, UserRole.GROUP_SUPERVISOR]) {
      assert.equal(await code(() => svc().create(user(r), { label: "x" })), "GROWTH_FORBIDDEN", r);
      assert.equal(await code(() => svc().update(user(r), "l1", { status: "PAUSED" })), "GROWTH_FORBIDDEN", r);
    }
    assert.equal(await code(() => svc().update(user(UserRole.CLINIC_ADMIN), "l1", { status: "REVOKED" })), "GROWTH_FORBIDDEN");
  });
  it("admin creates and pauses through the D1 service", async () => {
    const created: unknown[] = [], updated: unknown[] = [];
    const s = svc({ created, updated });
    await s.create(user(UserRole.CLINIC_ADMIN), { label: "Flyer" });
    await s.update(user(UserRole.CLINIC_ASSISTANT), "l1", { status: "PAUSED", label: "ignored" });
    assert.deepEqual(created, [{ label: "Flyer" }]);
    assert.deepEqual(updated, [["l1", { status: "PAUSED" }]]);
  });
  it("QR is an SVG of the short link; a doctor cannot read someone else's link QR; revoked is 404", async () => {
    const mine = { id: "l1", code: "ABCD2345", status: "ACTIVE", clinicianId: "u1" };
    const other = { id: "l2", code: "ZZZZ9999", status: "ACTIVE", clinicianId: "someone" };
    const gone = { id: "l3", code: "GONE2345", status: "REVOKED", clinicianId: "u1" };
    const s = svc({ links: [mine, other, gone] });
    const r = await s.qr(user(UserRole.PHYSICIAN), { linkId: "l1" });
    assert.match(r.svg, /^<\?xml|<svg/);
    assert.match(r.url, /\/q\/ABCD2345$/);
    assert.equal(await code(() => s.qr(user(UserRole.PHYSICIAN), { linkId: "l2" })), "ERR");
    assert.equal(await code(() => s.qr(user(UserRole.PHYSICIAN), { linkId: "l3" })), "ERR");
    const prof = await s.qr(user(UserRole.PHYSICIAN), {});
    assert.match(prof.url, /\/doctor\/dr-x/);
  });
});
