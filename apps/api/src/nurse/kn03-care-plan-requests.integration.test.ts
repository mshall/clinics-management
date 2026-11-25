import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { buildKit, buildWorld, cleanup, snapshotFor, type World } from "../home-visits/hv-test-kit";
import { MarketplacePatientIntakeService } from "../marketplace/marketplace-patient-intake.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import { SlotService } from "../scheduling/slot.service";
import { CarePlanRequestService } from "./care-plan-request.service";
import { CarePlanService } from "./care-plan.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const p = prisma as unknown as PrismaService;
const suffix = `${Date.now()}`.slice(-9);
const code = (e: { getResponse: () => { code: string } }) => e.getResponse().code;

/** P3 draft: POST /marketplace/v1/care-plan-requests (contracts 1.5.0) behind nurse.care_plans (GKN1). */
describe("KX-09 care-plan requests (integration)", () => {
  let w: World;
  let kit: Awaited<ReturnType<typeof buildKit>>;
  let svc: CarePlanRequestService;
  let off: CarePlanRequestService;
  const start = new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10);
  const address = { district: "nasr-city", line1: "9 Plan St", flat: "3" };
  const body = (over: Record<string, unknown> = {}) => ({ requestRef: `kx_cpr_${suffix}`, clinicId: w.clinicId, clinicianId: w.clinician.row.id, typeId: w.homeType.id, preferredStartDate: start, notes: "Dressing every day", visitAddress: address, patient: { phone: "+201055512345", firstNameEn: "Karim", lastNameEn: "Samir" }, ...over });

  before(async () => {
    await prisma.$connect();
    w = await buildWorld(prisma, `${suffix}r`, { edition: "NURSE", kind: "SOLO", plan: PlanKey.NURSE_PRO });
    kit = await buildKit(prisma);
    const week = emptyAvailabilityWeek("Africa/Cairo");
    for (const d of Object.values(week.days)) d.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, weekJson: week } });
    await prisma.appointmentType.update({ where: { id: w.homeType.id }, data: { depositAmount: 100, minNoticeMinutes: 0, maxDaysAhead: 90 } });
    await prisma.clinicianHomeSettings.create({ data: { tenantId: w.tenantId, clinicianId: w.clinician.row.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city"] } });
    const outbox = new OutboxEventService(p);
    const plans = new CarePlanService(p, kit.flags, new SlotService(p, outbox), kit.booking, kit.appointments as never, outbox, new AuditService(p));
    const intake = new MarketplacePatientIntakeService(p);
    svc = new CarePlanRequestService(p, kit.flags, new AuditService(p), intake, plans);
    const offKit = await buildKit(prisma, snapshotFor({ gates: { "nurse.care_plans": false } }));
    off = new CarePlanRequestService(p, offKit.flags, new AuditService(p), intake, plans);
  });
  after(async () => {
    await cleanup(prisma, w.tenantId);
    await prisma.$disconnect();
  });

  it("403 FEATURE_DISABLED until the nurse.care_plans gate is effective", async () => {
    await assert.rejects(off.receive(w.tenantId, body()), (e: { getResponse: () => { code: string; key: string } }) => code(e) === "FEATURE_DISABLED" && e.getResponse().key === "nurse.care_plans");
    assert.equal(await prisma.carePlanRequest.count({ where: { tenantId: w.tenantId } }), 0);
  });

  it("validates the shape (400), refuses a clinic that offers no care plans (422 CARE_PLANS_NOT_OFFERED) and an uncovered district (422 OUT_OF_COVERAGE)", async () => {
    await assert.rejects(svc.receive(w.tenantId, body({ patient: { phone: "", firstNameEn: "A", lastNameEn: "B" } })), /patient/);
    await assert.rejects(svc.receive(w.tenantId, body({ notes: "x".repeat(1001) })), /notes/);
    await assert.rejects(svc.receive(w.tenantId, body({ visitAddress: { district: "maadi", line1: "1 St" }, requestRef: `${suffix}_cov` })), (e: { getResponse: () => { code: string } }) => code(e) === "OUT_OF_COVERAGE");
    await assert.rejects(svc.receive(w.tenantId, body({ typeId: "no-such-type", requestRef: `${suffix}_nt` })), (e: { getResponse: () => { code: string } }) => code(e) === "CARE_PLANS_NOT_OFFERED");
  });

  it("is idempotent on requestRef, stores the address encrypted and never echoes it in the ack", async () => {
    const block = { origin: "MARKETPLACE", decisionId: "gpd_1", policyVersion: "v1", reason: "MARKETPLACE_TOUCH", evidenceHash: "a".repeat(64), product: "NURSE" };
    const a = await svc.receive(w.tenantId, body({ acquisition: block }));
    assert.deepEqual(a, { requestRef: `kx_cpr_${suffix}`, status: "RECEIVED", carePlanId: null });
    assert.deepEqual((await prisma.carePlanRequest.findFirstOrThrow({ where: { requestRef: a.requestRef } })).acquisition, block, "contracts 1.13.0: the optional acquisition block is stored as received");
    const again = await svc.receive(w.tenantId, body({ notes: "changed" }));
    assert.deepEqual(again, a);
    assert.equal(await prisma.carePlanRequest.count({ where: { tenantId: w.tenantId, requestRef: a.requestRef } }), 1);
    const row = await prisma.carePlanRequest.findFirstOrThrow({ where: { requestRef: a.requestRef } });
    assert.ok(row.visitAddressCiphertext && !row.visitAddressCiphertext.includes("Plan St"));
    assert.ok(!JSON.stringify(a).includes("Plan St"));
  });

  it("inbox: listed with the district only; accepting creates the real care plan (same requestRef, CARE_PLAN_CONFIRMED), a decided request cannot be decided again", async () => {
    const list = await svc.list(w.tenantId, "RECEIVED");
    assert.equal(list.items.length, 1);
    const item = list.items[0]!;
    assert.equal(item.district, "nasr-city");
    assert.ok(!JSON.stringify(item).includes("Plan St"), "list never carries the street address");
    const plan = await svc.accept(w.tenantId, w.admin.jwt, item.id, { nurseId: w.clinician.row.id, items: [{ appointmentTypeId: w.homeType.id, everyDays: 1, durationDays: 2, timeOfDay: "10:00" }] });
    assert.equal(plan.visitsTotal, 2);
    const row = await prisma.carePlanRequest.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(row.status, "ACCEPTED");
    assert.equal(row.carePlanId, plan.id);
    assert.ok(await prisma.outboxEvent.findFirst({ where: { tenantId: w.tenantId, type: "CARE_PLAN_CONFIRMED", aggregateId: plan.id } }));
    await assert.rejects(svc.accept(w.tenantId, w.admin.jwt, item.id, { nurseId: w.clinician.row.id, items: [] }), (e: { getResponse: () => { code: string } }) => code(e) === "CARE_PLAN_REQUEST_DECIDED");
    const replay = await svc.receive(w.tenantId, body());
    assert.equal(replay.carePlanId, plan.id);
  });

  it("decline records the reason and answers DECLINED on a replay", async () => {
    await svc.receive(w.tenantId, body({ requestRef: `${suffix}_d` }));
    const pending = (await svc.list(w.tenantId, "RECEIVED")).items[0]!;
    const declined = await svc.decline(w.tenantId, w.admin.jwt, pending.id, "Out of capacity");
    assert.equal(declined.status, "DECLINED");
    assert.equal((await svc.receive(w.tenantId, body({ requestRef: `${suffix}_d` }))).status, "DECLINED");
  });
});
