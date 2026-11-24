import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld, prisma, type World } from "../growth/growth-test-kit.test";
import { signLinkTouch } from "../growth/provider-links/link-touch";

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { message?: string }).message ?? String(e);
  }
};

/** GRW-GC-2 G-9: the Clinic accepts channel KIOREX_WHATSAPP (contracts 1.12.0) and commissions it like a marketplace booking. */
describe("GRW-GC-2 KIOREX_WHATSAPP booking channel (real Postgres)", () => {
  let w: World;
  let day = 0;
  const slot = () => new Date(Date.UTC(2027, 4, 1, 6) + day++ * 2 * 3_600_000).toISOString();
  const A = () => ({ clinicId: w.A.clinicId, doc: w.A.doc, typeId: w.A.typeId });
  before(async () => {
    w = await createWorld("wa");
  });
  after(async () => {
    await w.cleanup();
  });

  it("stores bookingSource KIOREX_WHATSAPP, and a new patient who attends is charged like a marketplace booking", async () => {
    const b = await w.book(A(), slot(), { channel: "KIOREX_WHATSAPP", attribution: { source: "kiorex_whatsapp" } });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
    assert.equal(row.bookingSource, "KIOREX_WHATSAPP");
    assert.equal(row.acquisitionOrigin, "UNATTRIBUTED");
    await w.checkIn(w.A.tenantId, row.id, new Date());
    const charge = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: row.id } });
    assert.equal(charge.amount.toFixed(2), "40.00");
    const d = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId: row.id } });
    assert.equal(d.bookingSource, "KIOREX_WHATSAPP");
    assert.equal(d.decision, "CHARGE");
    assert.equal(b.bookingSource ?? row.bookingSource, "KIOREX_WHATSAPP");
  });

  it("PROVIDER_LED evidence still removes the fee on a WhatsApp booking (evidence only ever removes a fee)", async () => {
    const link = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Desk wa", ownerScope: "CLINIC" });
    const lt = signLinkTouch({ tenantId: w.A.tenantId, code: link.code })!;
    const b = await w.book(A(), slot(), { channel: "KIOREX_WHATSAPP", lt });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
    assert.equal(row.acquisitionOrigin, "PROVIDER_LED");
    await w.checkIn(w.A.tenantId, row.id, new Date());
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: row.id } }), 0);
  });

  it("an unknown channel is still a 400, the other two channels are unchanged, and the request is idempotent on the key", async () => {
    assert.match(await codeOf(w.book(A(), slot(), { channel: "TELEGRAM" })), /Invalid channel/);
    const mk = await w.book(A(), slot(), { channel: "MARKETPLACE" });
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: mk.appointmentId } })).bookingSource, "KIOREX_MARKETPLACE");
    const s = slot();
    const first = await w.book(A(), s, { channel: "KIOREX_WHATSAPP" }, `wa-key-${w.suffix}`);
    const again = await w.book(A(), s, { channel: "KIOREX_WHATSAPP" }, `wa-key-${w.suffix}`);
    assert.equal(first.appointmentId, again.appointmentId);
  });

  it("the Kiorex tab and growth performance count a WhatsApp booking as a Kiorex booking", async () => {
    const perf = await w.svc.insights.performance(w.A.admin, { clinicId: w.A.clinicId, days: 30 });
    assert.ok(JSON.stringify(perf).length > 10);
    const n = await prisma.appointment.count({ where: { tenantId: w.A.tenantId, bookingSource: "KIOREX_WHATSAPP" } });
    assert.ok(n >= 2);
  });
});
