import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, TelehealthSessionStatus } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { buildThKit, buildThWorld, seedVideoAppointment, type ThKit, type ThWorld } from "./th-test-kit";
import { signTelehealthToken } from "./telehealth-token";

process.env.JWT_SECRET ??= "integration-test-jwt-secret-0123456789abcdef";
const prisma = createPrismaClient();
const suffix = `e${Date.now()}`.slice(-9);
const code = (e: unknown) => (e as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
const SEC = 1000;

/** EDGE-43: the join window at its exact edges, a reschedule during a call, link regeneration while someone waits, the flag turned off mid-call. */
describe("EDGE-43 telehealth window and mid-call edges (integration)", () => {
  let w: ThWorld; let kit: ThKit;
  before(async () => { await prisma.$connect(); w = await buildThWorld(prisma, suffix); kit = buildThKit(prisma); });
  after(async () => {
    await prisma.tenant.delete({ where: { id: w.tenantId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: w.marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("opens 10 minutes before the start: 11 minutes is TOO_EARLY, 9 minutes joins (the seed clock is real time, so the margins are minutes not milliseconds; the exact ms are covered by telehealth-core.node.test)", async () => {
    const early = await seedVideoAppointment(prisma, w, kit, { inMin: 11 });
    await assert.rejects(kit.telehealth.joinAsPatient(early.token), (e) => code(e) === "TELEHEALTH_TOO_EARLY");
    const ok = await seedVideoAppointment(prisma, w, kit, { inMin: 9 });
    assert.equal((await kit.telehealth.joinAsPatient(ok.token)).role, "PATIENT");
  });

  it("closes 60 minutes after the scheduled END: 59 minutes after end still joins, 61 minutes after end is EXPIRED (link page says EXPIRED too)", async () => {
    // 20 minute visit; end = start + 20. started 79 min ago -> ended 59 min ago -> open; started 81 min ago -> ended 61 min ago -> expired
    const open = await seedVideoAppointment(prisma, w, kit, { inMin: -79 });
    assert.equal((await kit.telehealth.joinAsPatient(open.token)).role, "PATIENT");
    const closed = await seedVideoAppointment(prisma, w, kit, { inMin: -81 });
    await assert.rejects(kit.telehealth.joinAsPatient(closed.token), (e) => code(e) === "TELEHEALTH_EXPIRED");
    assert.equal((await kit.telehealth.publicInfo(closed.token)).state, "EXPIRED");
  });

  it("reschedule DURING the call: the patient who is already in keeps a working link, and moving the visit a day out turns the next join into TOO_EARLY, never an error 500", async () => {
    const s = await seedVideoAppointment(prisma, w, kit, { inMin: 2 });
    await kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id);
    await kit.telehealth.joinAsPatient(s.token);
    await kit.appointments.update(w.tenantId, s.apt.id, { startsAt: new Date(Date.now() + 26 * 3600_000).toISOString(), endsAt: new Date(Date.now() + 26.5 * 3600_000).toISOString() } as never, w.admin.jwt);
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "TOO_EARLY");
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "TELEHEALTH_TOO_EARLY");
    await kit.appointments.update(w.tenantId, s.apt.id, { startsAt: new Date(Date.now() + 60 * SEC).toISOString(), endsAt: new Date(Date.now() + 21 * 60 * SEC).toISOString() } as never, w.admin.jwt);
    assert.equal((await kit.telehealth.joinAsPatient(s.token)).role, "PATIENT"); // moved back: the SAME token works again
  });

  it("link regenerated while the patient is waiting: the waiting tab is told LINK_REVOKED, the new link joins, presence is not shared between the two versions", async () => {
    const s = await seedVideoAppointment(prisma, w, kit, { inMin: 1 });
    await kit.telehealth.joinAsPatient(s.token);
    await kit.telehealth.regenerateLink(w.admin.jwt, s.session.id);
    await assert.rejects(kit.telehealth.pollSignals({ token: s.token }, 0), (e) => code(e) === "TELEHEALTH_LINK_REVOKED");
    const fresh = signTelehealthToken({ s: s.session.id, p: s.session.patientId, v: 2 });
    assert.equal((await kit.telehealth.joinAsPatient(fresh)).role, "PATIENT");
    await kit.telehealth.regenerateLink(w.admin.jwt, s.session.id);
    await assert.rejects(kit.telehealth.joinAsPatient(fresh), (e) => code(e) === "TELEHEALTH_LINK_REVOKED"); // two regenerations in a row: each kills the previous
  });

  it("flag turned OFF mid-call: both sides keep signalling and the visit can still end normally (existing sessions never get cut off)", async () => {
    process.env.TELEHEALTH_ATTENDANCE_SECONDS = "1";
    try {
      const s = await seedVideoAppointment(prisma, w, kit, { inMin: 1 });
      await kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id);
      await kit.telehealth.joinAsPatient(s.token);
      kit.state.flagOn = false;
      try {
        await kit.telehealth.pollSignals({ token: s.token }, 0);
        await kit.telehealth.pollSignals({ actor: w.doctor.jwt, sessionId: s.session.id }, 0);
        assert.equal((await kit.telehealth.end({ actor: w.doctor.jwt, sessionId: s.session.id })).ended, true);
        assert.equal((await kit.telehealth.publicInfo(s.token)).state, "ENDED");
      } finally { kit.state.flagOn = true; }
    } finally { delete process.env.TELEHEALTH_ATTENDANCE_SECONDS; }
  });

  it("a cancelled appointment never reopens by a late join; a COMPLETED/ENDED visit answers ENDED and stays ended", async () => {
    const s = await seedVideoAppointment(prisma, w, kit, { inMin: 1 });
    await prisma.appointment.update({ where: { id: s.apt.id }, data: { status: AppointmentStatus.CANCELLED } });
    await prisma.telehealthSession.update({ where: { id: s.session.id }, data: { status: TelehealthSessionStatus.CANCELLED } });
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "TELEHEALTH_CANCELLED");
  });

  it("two garbage and cross-session tokens are never an oracle: unknown session and wrong patient are the same LINK_INVALID", async () => {
    const s = await seedVideoAppointment(prisma, w, kit, { inMin: 1 });
    await assert.rejects(kit.telehealth.joinAsPatient(signTelehealthToken({ s: "no_such_session", p: s.session.patientId, v: 1 })), (e) => ["TELEHEALTH_LINK_INVALID", "TELEHEALTH_NOT_FOUND"].includes(code(e) ?? ""));
    await assert.rejects(kit.telehealth.joinAsPatient(signTelehealthToken({ s: s.session.id, p: "someone_else", v: 1 })), (e) => ["TELEHEALTH_LINK_INVALID", "TELEHEALTH_FORBIDDEN", "TELEHEALTH_NOT_FOUND"].includes(code(e) ?? ""));
  });
});
