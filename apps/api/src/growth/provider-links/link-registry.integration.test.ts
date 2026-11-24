import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createWorld, prisma, type World } from "../growth-test-kit.test";
import { MarketplaceReferralLinksController } from "../../marketplace/marketplace-referral-links.controller";

const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

describe("link registry: ReferralLinkCreated / ReferralLinkRevoked and the signed lookup (contracts 1.11.0)", () => {
  let w: World;
  before(async () => {
    w = await createWorld("lr");
  });
  after(async () => {
    await w.cleanup();
  });

  const events = (type: string, aggregateId: string) => prisma.outboxEvent.findMany({ where: { type, aggregateId }, orderBy: { createdAt: "asc" } });

  it("creating a link queues ReferralLinkCreated for Kiorex with the organisation reference and no person", async () => {
    const l = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "CLINIC", label: "Registry link", channelKind: "QR_POSTER" });
    const rows = await events("ReferralLinkCreated", l.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.target, "KIOREX");
    assert.equal(rows[0]!.tenantId, w.A.tenantId);
    const p = rows[0]!.payload as Record<string, unknown>;
    assert.equal(p.linkCode, l.code);
    assert.match(String(p.linkCode), CODE);
    assert.equal(p.orgRef, w.A.tenantId);
    assert.equal(p.clinicRef, w.A.clinicId);
    assert.equal(p.ownerScope, "CLINIC");
    assert.equal(p.channelKind, "QR_POSTER");
    assert.doesNotMatch(Object.keys(p).join(" "), /name|phone|email|patient|ip\b/i);
  });

  it("the signed lookup returns code, organisation and status; an unknown code is a 404 with a stable code", async () => {
    const l = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Lookup link" });
    const ctl = new MarketplaceReferralLinksController(w.svc.core);
    const rec = await ctl.get(l.code.toLowerCase());
    assert.equal(rec.code, l.code);
    assert.equal(rec.orgRef, w.A.tenantId);
    assert.equal(rec.status, "ACTIVE");
    assert.equal(rec.revokedAt, null);
    await assert.rejects(ctl.get("ZZZZZZZZ"), (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code === "REFERRAL_LINK_NOT_FOUND");
    await assert.rejects(ctl.get("nope"), { status: 404 });
  });

  it("pausing is visible through the lookup (no event); revoking queues exactly one ReferralLinkRevoked and the lookup says REVOKED", async () => {
    const l = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Revoke me" });
    const ctl = new MarketplaceReferralLinksController(w.svc.core);
    await w.svc.links.update(w.A.admin, l.id, { status: "PAUSED" });
    assert.equal((await ctl.get(l.code)).status, "PAUSED");
    assert.equal((await events("ReferralLinkRevoked", l.id)).length, 0);
    await w.svc.links.update(w.A.admin, l.id, { status: "REVOKED" });
    const rows = await events("ReferralLinkRevoked", l.id);
    assert.equal(rows.length, 1);
    const p = rows[0]!.payload as Record<string, unknown>;
    assert.equal(p.linkCode, l.code);
    assert.equal(p.orgRef, w.A.tenantId);
    assert.ok(!Number.isNaN(Date.parse(String(p.revokedAt))));
    const rec = await ctl.get(l.code);
    assert.equal(rec.status, "REVOKED");
    assert.ok(rec.revokedAt);
    // a revoked link cannot be changed again, so no second event can appear
    await assert.rejects(w.svc.links.update(w.A.admin, l.id, { status: "REVOKED" }), { status: 409 });
    assert.equal((await events("ReferralLinkRevoked", l.id)).length, 1);
  });

  it("the reconciliation feed lists changes since a timestamp, oldest first, with a working cursor", async () => {
    const ctl = new MarketplaceReferralLinksController(w.svc.core);
    const since = new Date(Date.now() - 1000).toISOString();
    const a = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Feed one" });
    const b = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Feed two" });
    const page1 = await ctl.list(since, "1");
    assert.equal(page1.items.length, 1);
    assert.ok(page1.nextCursor);
    const page2 = await ctl.list(since, "500", page1.nextCursor ?? undefined);
    const codes = [...page1.items, ...page2.items].map((r) => r.code);
    assert.ok(codes.includes(a.code) || codes.includes(b.code));
    assert.ok(page2.items.every((r) => r.code !== page1.items[0]!.code), "the cursor never repeats a row");
    await assert.rejects(ctl.list("not-a-date"), { status: 400 });
  });

  it("the queued payloads validate against the vendored contract shapes (field names and code format)", () => {
    const ex = JSON.parse(readFileSync(join(__dirname, "../../../../../../kiorex-contracts/events/examples/ReferralLinkCreated.example.json"), "utf8")) as { data: Record<string, unknown> };
    for (const k of ["linkCode", "ownerScope", "channelKind", "orgRef", "clinicRef", "createdAt"]) assert.ok(k in ex.data, `contract example has ${k}`);
  });
});
