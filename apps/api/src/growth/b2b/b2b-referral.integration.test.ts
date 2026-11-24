import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld, prisma, prismaSvc, type World } from "../growth-test-kit.test";
import { DAILY_LIMIT } from "./b2b-logic";
import { B2bReferralService } from "./b2b-referral.service";

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { const r = (e as { getResponse?: () => { code?: string } }).getResponse?.(); return r?.code ?? String((e as { status?: number }).status ?? e); }
};

describe("GRW-P4-C provider B2B referral, Clinic side (real Postgres)", () => {
  let w: World; let svc: B2bReferralService;
  before(async () => { w = await createWorld("b" + Math.random().toString(36).slice(2, 5)); svc = new B2bReferralService(prismaSvc, w.svc.audit, w.svc.outbox); });
  after(async () => { await prisma.outboxEvent.deleteMany({ where: { tenantId: { in: [w.A.tenantId, w.B.tenantId] }, type: "CorporateLeadReferred" } }); await prisma.providerB2BReferral.deleteMany({ where: { tenantId: { in: [w.A.tenantId, w.B.tenantId] } } }); await w.cleanup(); });

  it("a referral is stored and queued once for Kiorex as CorporateLeadReferred with company data only", async () => {
    const r = await svc.create(w.A.admin, { clinicId: w.A.clinicId, companyName: "Nile Logistics", sizeBucket: "200_999", contactRef: "ref-hr-1" });
    assert.equal(r.status, "SUBMITTED"); assert.equal(r.sizeBucket, "200_999");
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: w.A.tenantId, type: "CorporateLeadReferred" } });
    assert.equal(ev.length, 1); assert.equal(ev[0].target, "KIOREX"); assert.equal(ev[0].aggregateId, r.id);
    const p = ev[0].payload as Record<string, unknown>;
    assert.deepEqual(Object.keys(p).sort(), ["aggregateId", "aggregateType", "clinicId", "companyName", "contactRef", "orgRef", "referralId", "referredAt", "sizeBucket"]);
    assert.equal(p.orgRef, w.A.tenantId); assert.equal(p.referralId, r.id);
    assert.doesNotMatch(JSON.stringify(p), /@|\+20|patient|phone|email|name":"(?!Nile)/i);
  });

  it("a person is refused, never stored or queued: e-mail, phone, national id in the name or the reference", async () => {
    const before = await prisma.providerB2BReferral.count({ where: { tenantId: w.A.tenantId } }); const evBefore = await prisma.outboxEvent.count({ where: { tenantId: w.A.tenantId, type: "CorporateLeadReferred" } });
    for (const b of [{ companyName: "Acme", contactRef: "sara@acme.com" }, { companyName: "Acme", contactRef: "+201000000001" }, { companyName: "Call 01000000001" }, { companyName: "Acme", contactRef: "29004020101234" }])
      assert.equal(await codeOf(svc.create(w.A.admin, { clinicId: w.A.clinicId, ...b })), "B2B_PERSONAL_DATA");
    assert.equal(await codeOf(svc.create(w.A.admin, { clinicId: w.A.clinicId, companyName: "x" })), "B2B_INVALID");
    assert.equal(await prisma.providerB2BReferral.count({ where: { tenantId: w.A.tenantId } }), before); assert.equal(await prisma.outboxEvent.count({ where: { tenantId: w.A.tenantId, type: "CorporateLeadReferred" } }), evBefore);
  });

  it("the same company inside one organisation is a 409 for 90 days (any spelling), another organisation may refer it, and the list is tenant-scoped", async () => {
    await svc.create(w.A.admin, { clinicId: w.A.clinicId, companyName: "Delta Pharma" });
    assert.equal(await codeOf(svc.create(w.A.admin, { clinicId: w.A.clinicId, companyName: " delta  PHARMA. " })), "B2B_DUPLICATE");
    assert.equal(await codeOf(svc.create(w.B.admin, { clinicId: w.B.clinicId, companyName: "Delta Pharma" })), "OK");
    const later = new Date(Date.now() + 91 * 86_400_000);
    assert.equal(await codeOf(svc.create(w.A.admin, { clinicId: w.A.clinicId, companyName: "Delta Pharma" }, later)), "OK");
    const a = await svc.list(w.A.admin); const b = await svc.list(w.B.admin);
    assert.ok(a.items.every((i) => i.companyName) && a.items.length >= 3);
    assert.equal(b.items.length, 1); assert.ok(!JSON.stringify(b).includes("Nile Logistics"));
    assert.equal(a.note.reward, "NONE");
    assert.equal(await codeOf(svc.get(w.B.admin, a.items[0].id)), "404");
  });

  it("roles: admin and marketing refer, reception and doctors only (reception) read or are refused; a clinic of another organisation is refused", async () => {
    assert.equal(await codeOf(svc.create(w.A.marketing, { clinicId: w.A.clinicId, companyName: "Marketing Made Co" })), "OK");
    assert.equal(await codeOf(svc.create(w.A.recep, { clinicId: w.A.clinicId, companyName: "Reception Co" })), "GROWTH_FORBIDDEN");
    assert.equal(await codeOf(svc.list(w.A.recep)), "OK");
    assert.equal(await codeOf(svc.list(w.A.physician)), "GROWTH_FORBIDDEN");
    assert.equal(await codeOf(svc.create(w.A.admin, { clinicId: w.B.clinicId, companyName: "Foreign Clinic Co" })), "404");
    assert.equal(await codeOf(svc.create(w.platform, { clinicId: w.A.clinicId, companyName: "Platform Co" })), "GROWTH_FORBIDDEN");
  });

  it("without a clinic id (the staff app) the first main clinic of the organisation stands for it", async () => {
    const r = await svc.create(w.A.admin, { companyName: "Staff App Co" });
    assert.equal(r.clinicId, w.A.clinicId);
  });

  it("no reward, credit or fee-share side effect exists: no credit grant or wallet entry is written by a referral", async () => {
    const credits = async () => (await prisma.creditWallet.count()) + (await prisma.creditLedgerEntry.count());
    const before = await credits(); await svc.create(w.A.admin, { clinicId: w.A.clinicId, companyName: "No Reward Co" });
    assert.equal(await credits(), before);
  });

  it(`a flood is stopped: at most ${DAILY_LIMIT} referrals a day per organisation`, async () => {
    const t = new Date();
    for (let i = 0; i < DAILY_LIMIT; i++) { const code = await codeOf(svc.create(w.B.admin, { clinicId: w.B.clinicId, companyName: `Flood Co ${i}` }, t)); if (code !== "OK") assert.equal(code, "B2B_RATE_LIMITED"); }
    assert.equal(await codeOf(svc.create(w.B.admin, { clinicId: w.B.clinicId, companyName: "One More Co" }, t)), "B2B_RATE_LIMITED");
  });
});
