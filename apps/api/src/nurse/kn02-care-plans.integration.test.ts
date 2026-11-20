import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { buildKit, buildWorld, cleanup, snapshotFor, type World } from "../home-visits/hv-test-kit";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import { SlotService } from "../scheduling/slot.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CarePlanService } from "./care-plan.service";

const prisma = new PrismaClient();
const p = prisma as unknown as PrismaService;
const suffix = `${Date.now()}`.slice(-9);

describe("KNCP care plans (integration)", () => {
  let w: World;
  let svc: CarePlanService;
  let kit: Awaited<ReturnType<typeof buildKit>>;
  const start = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  const address = { district: "nasr-city", line1: "5 Care St", flat: "2" };

  before(async () => {
    await prisma.$connect();
    w = await buildWorld(prisma, `${suffix}p`, { edition: "NURSE", kind: "SOLO", plan: PlanKey.NURSE_PRO });
    kit = await buildKit(prisma);
    const week = emptyAvailabilityWeek("Africa/Cairo");
    for (const d of Object.values(week.days)) d.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, weekJson: week } });
    await prisma.appointmentType.update({ where: { id: w.homeType.id }, data: { depositAmount: 100, minNoticeMinutes: 0, maxDaysAhead: 90 } });
    await prisma.clinicianHomeSettings.create({ data: { tenantId: w.tenantId, clinicianId: w.clinician.row.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city"] } });
    const outbox = new OutboxEventService(p);
    svc = new CarePlanService(p, kit.flags, new SlotService(p, outbox), kit.booking, kit.appointments as never, outbox, new AuditService(p));
  });
  after(async () => {
    await cleanup(prisma, w.tenantId);
    await prisma.$disconnect();
  });

  const input = (over = {}) => ({ clinicId: w.clinicId, patientId: w.patient.id, nurseId: w.clinician.row.id, title: "Dressing daily x3", startDate: start, items: [{ appointmentTypeId: w.homeType.id, everyDays: 1, durationDays: 3, timeOfDay: "10:00" }], visitAddress: address, ...over });

  it("nurse.care_plans OFF (gate GKN1 not satisfied) => 403 FEATURE_DISABLED for NEW plans", async () => {
    const off = new CarePlanService(p, (await buildKit(prisma, snapshotFor({ gates: { "nurse.care_plans": false } }))).flags, {} as never, kit.booking, kit.appointments as never, new OutboxEventService(p), new AuditService(p));
    await assert.rejects(off.create(w.tenantId, w.admin.jwt, input()), (e: { getResponse: () => { code: string; key: string } }) => e.getResponse().code === "FEATURE_DISABLED" && e.getResponse().key === "nurse.care_plans");
  });

  it("KNCP01/02: dressing daily x 3 generates 3 real home visits through the slot engine; the first passes HVSAF03, follow-ups are plan visits; remaining-visit counter", async () => {
    const plan = await svc.create(w.tenantId, w.admin.jwt, input({ requestRef: `kx_cpr_${suffix}` }));
    assert.equal(plan.visitsTotal, 3);
    assert.equal(plan.visits.length, 3);
    assert.deepEqual(plan.visits.map((v) => v.sequence), [1, 2, 3]);
    assert.equal(plan.visitsRemaining, 3);
    assert.equal((plan as { unscheduled: unknown[] }).unscheduled.length, 0);
    const homeVisits = await prisma.homeVisit.findMany({ where: { tenantId: w.tenantId, appointmentId: { in: plan.visits.map((v) => v.appointmentId) } } });
    assert.equal(homeVisits.length, 3);
    // idempotent on the Kiorex requestRef
    const again = await svc.create(w.tenantId, w.admin.jwt, input({ requestRef: `kx_cpr_${suffix}` }));
    assert.equal(again.id, plan.id);
    // CARE_PLAN_CONFIRMED is queued for Kiorex-originated plans
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: w.tenantId, type: "CARE_PLAN_CONFIRMED", aggregateId: plan.id } });
    assert.ok(ev);
    const payload = ev!.payload as { visits: unknown[]; requestRef: string };
    assert.equal(payload.visits.length, 3);
    assert.ok(!/Care St|lat|lng/.test(JSON.stringify(payload)));
  });

  it("KNCP03: pause releases future visits, extend adds days, end needs a discharge note, emits CARE_PLAN_ENDED, and sharing needs the patient's consent", async () => {
    const plan = await svc.create(w.tenantId, w.admin.jwt, input({ title: "Plan B", startDate: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10), requestRef: `kx_cpr_${suffix}_b` }));
    const paused = await svc.pause(w.tenantId, w.admin.jwt, plan.id);
    assert.equal(paused.status, "PAUSED");
    assert.equal((paused as { cancelledAppointmentIds: string[] }).cancelledAppointmentIds.length, 3);
    const resumed = await svc.resume(w.tenantId, w.admin.jwt, plan.id, { startDate: new Date(Date.now() + 41 * 86_400_000).toISOString().slice(0, 10), visitAddress: address });
    assert.equal(resumed.status, "ACTIVE");
    assert.equal(resumed.visitsTotal, 6);
    const extended = await svc.extend(w.tenantId, w.admin.jwt, plan.id, { startDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10), extraDays: 2, visitAddress: address });
    assert.equal(extended.visitsTotal, 8);
    await assert.rejects(svc.end(w.tenantId, w.admin.jwt, plan.id, { reason: "COMPLETED", dischargeNote: " " }), /discharge note/);
    const ended = await svc.end(w.tenantId, w.admin.jwt, plan.id, { reason: "CANCELLED_BY_PATIENT", dischargeNote: "Patient travelled; wound healed" });
    assert.equal(ended.status, "ENDED");
    assert.ok((ended as { cancelledAppointmentIds: string[] }).cancelledAppointmentIds.length >= 1);
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: w.tenantId, type: "CARE_PLAN_ENDED", aggregateId: plan.id } });
    assert.equal((ev.payload as { reason: string }).reason, "CANCELLED_BY_PATIENT");
    assert.ok(!JSON.stringify(ev.payload).includes("wound healed"), "no clinical content in the event");
    await assert.rejects(svc.end(w.tenantId, w.admin.jwt, plan.id, { reason: "COMPLETED", dischargeNote: "again" }), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "CARE_PLAN_ALREADY_ENDED");
    await assert.rejects(svc.shareDischarge(w.tenantId, plan.id), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "CONSENT_REQUIRED");
    await prisma.patientRecordShareConsent.create({ data: { tenantId: w.tenantId, patientId: w.patient.id, scope: "VISIT_SUMMARY", granted: true } });
    assert.deepEqual(await svc.shareDischarge(w.tenantId, plan.id), { shared: true });
  });

  it("a first visit that cannot pass the home safeguards fails the whole plan (nothing is half-created)", async () => {
    await prisma.appointmentType.update({ where: { id: w.homeType.id }, data: { depositAmount: null } });
    const fresh = await prisma.patient.create({ data: { tenantId: w.tenantId, mrn: `NEW-${suffix}`, firstNameEn: "New", lastNameEn: "Patient", gender: "M", phone: `+2013${suffix.slice(-8)}` } });
    const before = await prisma.carePlan.count({ where: { tenantId: w.tenantId } });
    await assert.rejects(svc.create(w.tenantId, w.admin.jwt, input({ patientId: fresh.id, title: "Unverified", startDate: new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 10) })), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "FIRST_HOME_VISIT_REQUIRES_VERIFIED_PHONE_OR_DEPOSIT");
    assert.equal(await prisma.carePlan.count({ where: { tenantId: w.tenantId } }), before);
  });
});
