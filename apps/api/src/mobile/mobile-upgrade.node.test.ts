import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { GENERAL_FEATURE, MobileUpgradeService, OPEN_REQUESTS_MAX, shapeOpenRequests, UPGRADE_DEDUPE_MS, cleanNote, findDuplicate, isKnownFeature } from "./mobile-upgrade.service";

type Row = { id: string; tenantId: string; userId: string; role: string; featureKey: string; plan: string; note: string | null; notifiedCount: number; createdAt: Date };

function harness(opts: { enabled?: boolean; owners?: string[] } = {}) {
  const rows: Row[] = []; const pushes: unknown[][] = []; const audits: unknown[] = [];
  const prisma = {
    mobileUpgradeRequest: {
      findMany: async ({ where }: { where: { userId: string; featureKey: string; createdAt: { gt: Date } } }) => rows.filter((r) => r.userId === where.userId && r.featureKey === where.featureKey && r.createdAt > where.createdAt.gt),
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "notifiedCount"> }) => { const r = { ...data, id: `r${rows.length + 1}`, notifiedCount: 0, createdAt: new Date() }; rows.push(r); return r; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    },
    user: {
      findUniqueOrThrow: async () => ({ role: UserRole.NURSE, additionalRoles: [] }),
      findMany: async () => (opts.owners ?? ["owner1"]).map((id) => ({ id })),
    },
  };
  const ent = { evaluate: async () => ({ enabled: opts.enabled ?? false, rawPlan: "LITE" }) };
  const push = { notifyUsers: async (...a: unknown[]) => { pushes.push(a); return (a[1] as string[]).length; } };
  const audit = { recordEvent: async (e: unknown) => { audits.push(e); } };
  const svc = new MobileUpgradeService(prisma as never, audit as never, ent as never, push as never);
  return { svc, rows, pushes, audits };
}
const nurse = { userId: "nurse1", tenantId: "t1", email: "n@x", role: UserRole.NURSE };

describe("mobile upgrade request", () => {
  it("validates feature keys against the module registry", () => {
    assert.ok(isKnownFeature("clinic.vitals") && isKnownFeature(GENERAL_FEATURE));
    assert.ok(!isKnownFeature("pharmacy.rx") && !isKnownFeature("../x"));
  });
  it("findDuplicate only matches inside the 24h window", () => {
    const now = Date.now();
    assert.equal(findDuplicate([{ createdAt: new Date(now - UPGRADE_DEDUPE_MS - 1) }], now), null);
    assert.ok(findDuplicate([{ createdAt: new Date(now - 1000) }], now));
  });
  it("cleanNote trims, caps and rejects non-text", () => {
    assert.equal(cleanNote("  "), null);
    assert.equal(cleanNote("x".repeat(900))!.length, 500);
    assert.throws(() => cleanNote(5));
  });
  it("records requester, role, org, feature, note and notifies owners once", async () => {
    const h = harness();
    const r = await h.svc.request(nurse, { featureKey: "clinic.vitals", note: "need it on rounds" });
    assert.equal(r.status, "REQUESTED"); assert.equal(r.deduped, false); assert.equal(r.notified, 1);
    assert.deepEqual([h.rows[0].tenantId, h.rows[0].userId, h.rows[0].role, h.rows[0].featureKey, h.rows[0].note, h.rows[0].plan], ["t1", "nurse1", "NURSE", "clinic.vitals", "need it on rounds", "LITE"]);
    assert.equal(h.pushes[0][2], "UPGRADE_REQUEST");
    assert.equal(h.audits.length, 1);
  });
  it("is idempotent: a repeat inside 24h returns the original and does not notify again", async () => {
    const h = harness();
    const a = await h.svc.request(nurse, { featureKey: "clinic.vitals" });
    const b = await h.svc.request(nurse, { featureKey: "clinic.vitals" });
    assert.equal(b.deduped, true); assert.equal(b.id, a.id); assert.equal(b.requestedAt, a.requestedAt);
    assert.equal(h.rows.length, 1); assert.equal(h.pushes.length, 1);
  });
  it("a different feature is a new request; old requests (>24h) do not block", async () => {
    const h = harness();
    await h.svc.request(nurse, { featureKey: "clinic.vitals" });
    const c = await h.svc.request(nurse, { featureKey: "clinic.homevisits" });
    assert.equal(c.deduped, false);
    h.rows[0].createdAt = new Date(Date.now() - UPGRADE_DEDUPE_MS - 5);
    assert.equal((await h.svc.request(nurse, { featureKey: "clinic.vitals" })).deduped, false);
    assert.equal(h.rows.length, 3);
  });
  it("rejects unknown features and records nothing when the org already has the app", async () => {
    await assert.rejects(harness().svc.request(nurse, { featureKey: "nope" }));
    const h = harness({ enabled: true });
    assert.equal((await h.svc.request(nurse, {})).status, "ALREADY_ENTITLED");
    assert.equal(h.rows.length, 0);
  });
});

describe("bootstrap openRequestItems (owner Home card)", () => {
  const mk = (id: string, who: string, mins: number, note: string | null = null) => ({ id, userId: who, role: "NURSE", featureKey: "general", note, status: "OPEN", tenantId: "x", createdAt: new Date(Date.UTC(2026, 0, 1, 0, 60 - mins)) });
  const stub = (rows: ReturnType<typeof mk>[]) => {
    let took = 0;
    const prisma = {
      mobileUpgradeRequest: { findFirst: async () => null, count: async () => rows.length, findMany: async ({ take }: { take: number }) => { took = take; return rows.slice(0, take); } },
      user: { findMany: async () => [{ id: "p1", displayName: "Nadia Ali", email: "secret@x", phone: "123" }].map(({ id, displayName }) => ({ id, displayName })) },
    };
    return { svc: new MobileUpgradeService(prisma as never, {} as never, {} as never, {} as never), took: () => took };
  };
  const owner = { userId: "owner1", tenantId: "t1" };
  const staff = { userId: "nurse1", tenantId: "t1" };
  it("shapeOpenRequests: display name only, role fallback, note only when present, capped", () => {
    const out = shapeOpenRequests(Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, featureKey: "general", role: "NURSE", note: i === 0 ? "need it" : null, createdAt: new Date(0), who: i === 0 ? "p1" : "ghost" })), new Map([["p1", "Nadia Ali"]]));
    assert.equal(out.length, OPEN_REQUESTS_MAX);
    assert.deepEqual(out[0], { id: "r0", featureKey: "general", requesterRole: "NURSE", requesterName: "Nadia Ali", requestedAt: "1970-01-01T00:00:00.000Z", note: "need it" });
    assert.equal(out[1].requesterName, "NURSE"); assert.ok(!("note" in out[1]));
  });
  it("owner gets up to 10 items (no contact fields); count stays the real total", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => mk(`r${i}`, i === 0 ? "p1" : "p2", i));
    const h = stub(rows);
    const b = await h.svc.bootstrapBlock(owner as never, ["m"], true);
    assert.equal(b.openRequests, 12); assert.equal(b.openRequestItems.length, 10); assert.equal(h.took(), 10);
    assert.equal(b.openRequestItems[0].requesterName, "Nadia Ali");
    assert.deepEqual(Object.keys(b.openRequestItems[0]).sort(), ["featureKey", "id", "requestedAt", "requesterName", "requesterRole"]);
  });
  it("non-approvers never get items or a count", async () => {
    const b = await stub([mk("r1", "p1", 1)]).svc.bootstrapBlock(staff as never, ["m"], false);
    assert.equal(b.openRequests, null); assert.deepEqual(b.openRequestItems, []); assert.equal(b.canApprove, false);
  });
});
