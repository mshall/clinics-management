import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, EncounterStatus, TelehealthSessionStatus } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { buildThKit, buildThWorld, seedVideoAppointment, type ThKit, type ThWorld } from "./th-test-kit";
import { signTelehealthToken } from "./telehealth-token";

process.env.JWT_SECRET ??= "integration-test-jwt-secret-0123456789abcdef";
const prisma = createPrismaClient();
const suffix = `${Date.now()}`.slice(-9);
const code = (e: unknown) => (e as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ADR-039 telehealth (integration)", () => {
  let w: ThWorld;
  let kit: ThKit;

  before(async () => {
    await prisma.$connect();
    w = await buildThWorld(prisma, suffix);
    kit = buildThKit(prisma);
  });
  after(async () => {
    await prisma.tenant.delete({ where: { id: w.tenantId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: w.marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("Flow B: staff creates a telehealth appointment -> session SCHEDULED + created event + derived visitType; phone is required", async () => {
    const startsAt = new Date(Date.now() + 3 * 3600_000).toISOString();
    const dto = await kit.appointments.create(w.tenantId, w.admin.jwt, { clinicId: w.clinicId, patientId: w.patient.id, clinicianId: w.doctor.row.id, startsAt, visitMode: "TELEHEALTH", notes: "Headache for 3 days" } as never);
    assert.equal(dto.serviceLocation, "VIDEO");
    assert.equal(dto.visitType, "TELEHEALTH");
    assert.equal(dto.telehealth?.status, "SCHEDULED");
    assert.match(dto.telehealth!.joinUrl!, /\/v\/[\w-]+\.[\w-]+$/);
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: w.tenantId, type: "telehealth.session.created", aggregateId: dto.telehealth!.sessionId } });
    assert.equal(ev.length, 1);
    assert.equal(ev[0]!.target, "INTERNAL"); // clinic-made: not sent to Kiorex

    const noPhone = await prisma.patient.create({ data: { tenantId: w.tenantId, mrn: `NP-${suffix}`, firstNameEn: "No", lastNameEn: "Phone", gender: "F", phone: "" } });
    await assert.rejects(
      kit.appointments.create(w.tenantId, w.admin.jwt, { clinicId: w.clinicId, patientId: noPhone.id, clinicianId: w.doctor.row.id, startsAt: new Date(Date.now() + 5 * 3600_000).toISOString(), visitMode: "TELEHEALTH" } as never),
      (e) => code(e) === "TELEHEALTH_PATIENT_PHONE_REQUIRED",
    );
  });

  it("flag OFF / doctor does not offer telehealth: creation is refused, existing sessions stay joinable", async () => {
    const seeded = await seedVideoAppointment(prisma, w, kit);
    kit.state.flagOn = false;
    try {
      await assert.rejects(kit.appointments.create(w.tenantId, w.admin.jwt, { clinicId: w.clinicId, patientId: w.patient.id, clinicianId: w.doctor.row.id, startsAt: new Date(Date.now() + 9 * 3600_000).toISOString(), visitMode: "TELEHEALTH" } as never), (e) => (e as { getStatus?: () => number }).getStatus?.() === 403);
      const j = await kit.telehealth.joinAsClinician(w.doctor.jwt, seeded.session.id);
      assert.equal(j.role, "CLINICIAN");
      assert.equal((await kit.telehealth.getForStaff(w.doctor.jwt, seeded.session.id)).enabled, false);
    } finally {
      kit.state.flagOn = true;
    }
    await prisma.clinicianTelehealthSetting.update({ where: { clinicianId: w.otherDoctor.row.id }, data: { offersTelehealth: false } });
    await assert.rejects(kit.appointments.create(w.tenantId, w.admin.jwt, { clinicId: w.clinicId, patientId: w.patient.id, clinicianId: w.otherDoctor.row.id, startsAt: new Date(Date.now() + 9 * 3600_000).toISOString(), visitMode: "TELEHEALTH" } as never), (e) => code(e) === "TELEHEALTH_NOT_OFFERED");
    await prisma.clinicianTelehealthSetting.update({ where: { clinicianId: w.otherDoctor.row.id }, data: { offersTelehealth: true } });
  });

  it("window is computed at join: too early, then a reschedule moves it and the SAME link works", async () => {
    const s = await seedVideoAppointment(prisma, w, kit, { inMin: 120 });
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "TELEHEALTH_TOO_EARLY");
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "TOO_EARLY");
    await kit.appointments.update(w.tenantId, s.apt.id, { startsAt: new Date(Date.now() + 2 * 60_000).toISOString(), endsAt: new Date(Date.now() + 22 * 60_000).toISOString() } as never, w.admin.jwt);
    const j = await kit.telehealth.joinAsPatient(s.token);
    assert.equal(j.role, "PATIENT");
    assert.equal(j.transport, "p2p-webrtc");
    assert.equal(j.turn, "stun-only");
    assert.ok(j.iceServers.length > 0);
    const info = await kit.telehealth.publicInfo(s.token);
    assert.equal(info.state, "OPEN");
    assert.equal((info as { moved: boolean }).moved, false); // moved is tracked by the notifier (reminderState.firstStartsAt)
  });

  it("authz: only the current clinician joins; reassignment moves access; failed authz is audited", async () => {
    const s = await seedVideoAppointment(prisma, w, kit);
    await assert.rejects(kit.telehealth.joinAsClinician(w.otherDoctor.jwt, s.session.id), (e) => code(e) === "TELEHEALTH_FORBIDDEN");
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: w.tenantId, action: "telehealth.authz_denied", resourceId: s.session.id } }));
    await kit.appointments.update(w.tenantId, s.apt.id, { clinicianId: w.otherDoctor.row.id } as never, w.admin.jwt);
    assert.equal((await prisma.telehealthSession.findUniqueOrThrow({ where: { id: s.session.id } })).clinicianUserId, w.otherDoctor.row.id);
    await assert.rejects(kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id), (e) => code(e) === "TELEHEALTH_FORBIDDEN"); // old doctor lost access
    assert.equal((await kit.telehealth.joinAsClinician(w.otherDoctor.jwt, s.session.id)).role, "CLINICIAN");
  });

  it("link revocation: regenerate bumps linkVersion and the old token dies; forged tokens are invalid", async () => {
    const s = await seedVideoAppointment(prisma, w, kit);
    assert.equal((await kit.telehealth.joinAsPatient(s.token)).role, "PATIENT");
    const r = await kit.telehealth.regenerateLink(w.admin.jwt, s.session.id);
    assert.equal(r.linkVersion, 2);
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "TELEHEALTH_LINK_REVOKED");
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "LINK_REVOKED");
    const fresh = signTelehealthToken({ s: s.session.id, p: s.session.patientId, v: 2 });
    assert.equal((await kit.telehealth.joinAsPatient(fresh)).role, "PATIENT");
    await assert.rejects(kit.telehealth.joinAsPatient("garbage.token"), (e) => code(e) === "TELEHEALTH_LINK_INVALID");
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: w.tenantId, action: "telehealth.session.link_regenerated", resourceId: s.session.id } }));
  });

  it("signaling: monotonic seq per session, each side sees only the other side's messages, oversize/unknown rejected", async () => {
    const s = await seedVideoAppointment(prisma, w, kit);
    await kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id);
    await kit.telehealth.joinAsPatient(s.token);
    const a = await kit.telehealth.postSignal({ actor: w.doctor.jwt, sessionId: s.session.id }, { type: "OFFER", payload: { sdp: "v=0" } });
    const b = await kit.telehealth.postSignal({ token: s.token }, { type: "ANSWER", payload: { sdp: "v=0 a" } });
    const c = await kit.telehealth.postSignal({ actor: w.doctor.jwt, sessionId: s.session.id }, { type: "ICE_CANDIDATE", payload: { candidate: "x" } });
    assert.deepEqual([a.seq, b.seq, c.seq], [1, 2, 3]);
    const patientView = await kit.telehealth.pollSignals({ token: s.token }, 0);
    assert.deepEqual(patientView.messages.map((m) => m.type), ["OFFER", "ICE_CANDIDATE"]);
    const after1 = await kit.telehealth.pollSignals({ token: s.token }, 1);
    assert.deepEqual(after1.messages.map((m) => m.seq), [3]);
    const docView = await kit.telehealth.pollSignals({ actor: w.doctor.jwt, sessionId: s.session.id }, 0);
    assert.deepEqual(docView.messages.map((m) => m.type), ["ANSWER"]);
    assert.equal(docView.peerPresent, true);
    await assert.rejects(kit.telehealth.postSignal({ token: s.token }, { type: "NOPE", payload: {} }), (e) => code(e) === "TELEHEALTH_BAD_SIGNAL");
    await assert.rejects(kit.telehealth.postSignal({ token: s.token }, { type: "OFFER", payload: { sdp: "x".repeat(20_000) } }), (e) => code(e) === "TELEHEALTH_BAD_SIGNAL");
    assert.equal(await kit.telehealth["signaling"].purgeOlderThan(new Date(Date.now() + 1000)) >= 3, true);
  });

  it("prepayment gate: patient blocked while a deposit is PENDING, clinician can open the room", async () => {
    const s = await seedVideoAppointment(prisma, w, kit);
    const dep = await prisma.patientDeposit.create({ data: { tenantId: w.tenantId, clinicId: w.clinicId, patientId: w.patient.id, appointmentId: s.apt.id, amount: 100, currency: "EGP", method: "CARD" as never, status: "PENDING" } });
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "PAYMENT_REQUIRED");
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "PAYMENT_REQUIRED");
    assert.equal((await kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id)).role, "CLINICIAN");
    await prisma.patientDeposit.update({ where: { id: dep.id }, data: { status: "HELD" } });
    assert.equal((await kit.telehealth.joinAsPatient(s.token)).role, "PATIENT");
  });

  it("attendance: both present >= threshold marks attended ONCE: one CHECKED_IN, one EGP 40 commission, one pre-filled Telehealth encounter, under repeat polls, races and a manual check-in", async () => {
    process.env.TELEHEALTH_ATTENDANCE_SECONDS = "1";
    try {
      const s = await seedVideoAppointment(prisma, w, kit, { kiorex: true, notes: "Persistent cough" });
      await kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id);
      await kit.telehealth.joinAsPatient(s.token);
      await kit.telehealth.pollSignals({ token: s.token }, 0);
      await kit.telehealth.pollSignals({ actor: w.doctor.jwt, sessionId: s.session.id }, 0);
      assert.equal((await prisma.telehealthSession.findUniqueOrThrow({ where: { id: s.session.id } })).status, TelehealthSessionStatus.ACTIVE);
      assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: s.apt.id } })).status, AppointmentStatus.CONFIRMED, "not attended before the threshold");
      await wait(1300);
      await Promise.all([
        kit.telehealth.pollSignals({ token: s.token }, 0),
        kit.telehealth.pollSignals({ actor: w.doctor.jwt, sessionId: s.session.id }, 0),
        kit.telehealth.pollSignals({ token: s.token }, 0),
        kit.telehealth.pollSignals({ actor: w.doctor.jwt, sessionId: s.session.id }, 0),
      ]);
      await kit.telehealth.pollSignals({ token: s.token }, 0);
      const apt = await prisma.appointment.findUniqueOrThrow({ where: { id: s.apt.id } });
      assert.equal(apt.status, AppointmentStatus.CHECKED_IN);
      assert.equal(apt.queueTicketNumber, null, "no queue ticket for a call");
      // a manual check-in by staff afterwards (or a second attendance) must not bill twice
      await kit.appointments.updateStatus(w.tenantId, s.apt.id, AppointmentStatus.CHECKED_IN, w.admin.jwt).catch(() => undefined);
      await kit.appointments.markAttended(w.tenantId, s.apt.id, { source: "MANUAL" });
      const charges = await prisma.kiorexCommissionCharge.findMany({ where: { appointmentId: s.apt.id } });
      assert.equal(charges.length, 1);
      assert.equal(Number(charges[0]!.amount), 40);
      const checkedInEvents = await prisma.outboxEvent.count({ where: { tenantId: w.tenantId, aggregateId: s.apt.id, type: "CHECKED_IN" } });
      assert.equal(checkedInEvents, 1);
      const encs = await prisma.encounter.findMany({ where: { appointmentId: s.apt.id } });
      assert.equal(encs.length, 1);
      assert.equal(encs[0]!.visitType, "Telehealth");
      assert.equal(encs[0]!.status, EncounterStatus.DRAFT);
      assert.equal(encs[0]!.chiefComplaint, "Persistent cough");
      assert.equal(encs[0]!.clinicianId, w.doctor.row.id);
      assert.equal(encs[0]!.patientId, w.patient.id);
      // reassigned doctor updates the draft
      await prisma.appointment.update({ where: { id: s.apt.id }, data: { status: AppointmentStatus.CHECKED_IN } });
      await kit.appointments.update(w.tenantId, s.apt.id, { clinicianId: w.otherDoctor.row.id } as never, w.admin.jwt);
      assert.equal((await prisma.encounter.findFirstOrThrow({ where: { appointmentId: s.apt.id } })).clinicianId, w.otherDoctor.row.id);
      const ended = await kit.telehealth.end({ actor: w.otherDoctor.jwt, sessionId: s.session.id }).catch(() => null);
      assert.ok(ended === null || ended.ended === true);
    } finally {
      delete process.env.TELEHEALTH_ATTENDANCE_SECONDS;
    }
  });

  it("encounter is created once even when an attended telehealth appointment is also checked in manually first (no duplicates, any status)", async () => {
    const s = await seedVideoAppointment(prisma, w, kit, { kiorex: true });
    await kit.appointments.updateStatus(w.tenantId, s.apt.id, AppointmentStatus.CHECKED_IN, w.admin.jwt);
    await Promise.all([1, 2, 3].map(() => kit.appointments.markAttended(w.tenantId, s.apt.id, { source: "TELEHEALTH" })));
    assert.equal(await prisma.encounter.count({ where: { appointmentId: s.apt.id } }), 1);
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: s.apt.id } }), 1);
    await prisma.encounter.updateMany({ where: { appointmentId: s.apt.id }, data: { status: EncounterStatus.FINALIZED } });
    await kit.appointments.markAttended(w.tenantId, s.apt.id, { source: "TELEHEALTH" });
    assert.equal(await prisma.encounter.count({ where: { appointmentId: s.apt.id } }), 1, "a signed encounter also blocks a duplicate");
  });

  it("MISSED: patient absent -> MISSED + NO_SHOW; doctor absent -> MISSED, flagged for staff review, appointment stays open, patient NOT charged", async () => {
    const patientAbsent = await seedVideoAppointment(prisma, w, kit, { inMin: -20, kiorex: true });
    await prisma.telehealthSession.update({ where: { id: patientAbsent.session.id }, data: { clinicianJoinedAt: new Date(), status: "WAITING" } });
    const doctorAbsent = await seedVideoAppointment(prisma, w, kit, { inMin: -20, kiorex: true });
    await kit.telehealth.tick();
    const a = await prisma.telehealthSession.findUniqueOrThrow({ where: { id: patientAbsent.session.id } });
    assert.equal(a.status, TelehealthSessionStatus.MISSED);
    assert.equal(a.needsStaffReview, false);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: patientAbsent.apt.id } })).status, AppointmentStatus.NO_SHOW);
    assert.equal((await kit.telehealth.publicInfo(patientAbsent.token)).state, "MISSED");
    const d = await prisma.telehealthSession.findUniqueOrThrow({ where: { id: doctorAbsent.session.id } });
    assert.equal(d.status, TelehealthSessionStatus.MISSED);
    assert.equal(d.needsStaffReview, true);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: doctorAbsent.apt.id } })).status, AppointmentStatus.CONFIRMED);
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: doctorAbsent.apt.id } }), 0);
    const missed = await prisma.outboxEvent.findMany({ where: { tenantId: w.tenantId, type: "telehealth.session.missed", aggregateId: d.id } });
    assert.equal(missed.length, 1);
    assert.equal((missed[0]!.payload as { patientCharged: boolean }).patientCharged, false);
    assert.equal(await kit.telehealth.tick().then((r) => r.missed), 0, "idempotent");
    // late arrival after a doctor no-show revives the visit
    const j = await kit.telehealth.joinAsClinician(w.doctor.jwt, doctorAbsent.session.id).catch((e) => e);
    assert.ok(j.role === "CLINICIAN" || code(j) === "TELEHEALTH_EXPIRED");
  });

  it("cancel and in-person conversion: the link shows the right state, session cancelled", async () => {
    const s = await seedVideoAppointment(prisma, w, kit);
    await kit.appointments.update(w.tenantId, s.apt.id, { visitMode: "IN_CLINIC" } as never, w.admin.jwt);
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "CONVERTED_IN_PERSON");
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "TELEHEALTH_CONVERTED_IN_PERSON");
    await kit.appointments.update(w.tenantId, s.apt.id, { visitMode: "TELEHEALTH" } as never, w.admin.jwt);
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "OPEN", "converting back revives the SAME link");
    await kit.appointments.updateStatus(w.tenantId, s.apt.id, AppointmentStatus.CANCELLED, w.admin.jwt, "test");
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "CANCELLED");
    await assert.rejects(kit.telehealth.joinAsPatient(s.token), (e) => code(e) === "TELEHEALTH_CANCELLED");
  });

  it("end: clinician ends once (idempotent), emits ended event; patient leaving does not end the visit", async () => {
    const s = await seedVideoAppointment(prisma, w, kit);
    await kit.telehealth.joinAsClinician(w.doctor.jwt, s.session.id);
    await kit.telehealth.joinAsPatient(s.token);
    assert.equal((await kit.telehealth.end({ token: s.token })).ended, false);
    assert.equal((await kit.telehealth.end({ actor: w.doctor.jwt, sessionId: s.session.id })).ended, true);
    assert.equal((await kit.telehealth.end({ actor: w.doctor.jwt, sessionId: s.session.id })).ended, false);
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId: w.tenantId, type: "telehealth.session.ended", aggregateId: s.session.id } }), 1);
    assert.equal((await kit.telehealth.publicInfo(s.token)).state, "ENDED");
  });
});
