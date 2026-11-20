import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient } from "@prisma/client";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { RecordShareService } from "../marketplace/record-share.service";
import { buildKit, buildWorld, cleanup, seedVisit, snapshotFor, type World } from "../home-visits/hv-test-kit";
import type { PrismaService } from "../prisma/prisma.service";
import { LabSampleService, type RecordCollectionInput } from "./lab-sample.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const p = prisma as unknown as PrismaService;
const suffix = `${Date.now()}`.slice(-9);

const errCode = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "OK";
  } catch (e) {
    const r = (e as { getResponse?: () => { code?: string; errorCode?: string } }).getResponse?.();
    return r?.code ?? r?.errorCode ?? (e as { name?: string }).name ?? "ERR";
  }
};

describe("KNLAB01 nurse sample collection -> LabOrderPlaced (integration)", () => {
  let w: World;
  let lite: World;
  let svc: LabSampleService;
  let liteSvc: LabSampleService;
  let offSvc: LabSampleService;
  let apptId: string;
  const cleanups: string[] = [];
  const good = (over: Partial<RecordCollectionInput> = {}): RecordCollectionInput => ({
    appointmentId: apptId,
    identifiers: [{ kind: "FULL_NAME", value: "Test Patient" }, { kind: "DATE_OF_BIRTH", value: "1990-01-01" }],
    tubes: [{ label: `NRS-${suffix}-A`, specimenType: "BLOOD", container: "EDTA" }],
    temperatureC: 5,
    ...over,
  });
  const newOrder = async (world: World = w, service: LabSampleService = svc, appt = apptId, nurseJwt = w.clinician.jwt) =>
    service.createOrder(world.tenantId, nurseJwt, appt, { items: [{ code: "CBC", nameEn: "Complete blood count" }], prescriber: { name: "Dr Hesham Nabil", orderedOn: "2026-11-19" }, confirmedDoctorOrder: true });
  const grantConsent = (world: World = w) => prisma.patientRecordShareConsent.create({ data: { tenantId: world.tenantId, patientId: world.patient.id, scope: "LAB_RESULTS", granted: true, source: "test" } });

  before(async () => {
    await prisma.$connect();
    w = await buildWorld(prisma, `${suffix}l`, { edition: "NURSE", kind: "SOLO", plan: PlanKey.NURSE_PRO });
    lite = await buildWorld(prisma, `${suffix}m`, { edition: "NURSE", kind: "SOLO", plan: PlanKey.NURSE_LITE });
    cleanups.push(w.tenantId, lite.tenantId);
    await prisma.patient.update({ where: { id: w.patient.id }, data: { dob: new Date("1990-01-01T00:00:00Z") } });
    // plan rows seeded before nurse_lab_samples existed: grant it by override for the Pro tenant (a fresh `db:seed` carries it in the plan)
    await prisma.tenantEntitlementOverride.create({ data: { tenantId: w.tenantId, key: "nurse_lab_samples", valueJson: true, reason: "test", createdBy: "test" } });
    const kit = await buildKit(prisma);
    const off = await buildKit(prisma, snapshotFor({ off: ["clinic.lab_order_handoff"] }));
    const ent = new EntitlementsService(p);
    svc = new LabSampleService(p, kit.flags, ent, new RecordShareService(p), kit.outbox);
    liteSvc = new LabSampleService(p, kit.flags, ent, new RecordShareService(p), kit.outbox);
    offSvc = new LabSampleService(p, off.flags, ent, new RecordShareService(p), off.outbox);
    apptId = (await seedVisit(prisma, w, { start: new Date(Date.now() + 3600_000) })).appt.id;
  });
  after(async () => {
    for (const t of cleanups) {
      await prisma.outboxEvent.deleteMany({ where: { tenantId: t } });
      await cleanup(prisma, t);
    }
    await prisma.$disconnect();
  });

  it("edition, plan and flag gates: Clinic edition 403, Nurse Lite 402, flag OFF 403 FEATURE_DISABLED (nothing written)", async () => {
    const clinicWorld = await buildWorld(prisma, `${suffix}c`);
    cleanups.push(clinicWorld.tenantId);
    assert.equal(await errCode(() => liteSvc.recordCollection(clinicWorld.tenantId, clinicWorld.clinician.jwt, "x", good())), "NURSE_EDITION_REQUIRED");
    const liteVisit = await seedVisit(prisma, lite, { start: new Date(Date.now() + 7200_000) });
    assert.equal(await errCode(() => liteSvc.createOrder(lite.tenantId, lite.clinician.jwt, liteVisit.appt.id, { items: [{ code: "CBC", nameEn: "CBC" }], prescriber: { name: "Dr X", orderedOn: "2026-11-19" }, confirmedDoctorOrder: true })), "PLAN_UPGRADE_REQUIRED");
    const o = await newOrder();
    assert.equal(await errCode(() => offSvc.recordCollection(w.tenantId, w.clinician.jwt, o.id, good())), "FEATURE_DISABLED");
    assert.equal(await prisma.labSampleCollection.count({ where: { tenantId: w.tenantId } }), 0);
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId: w.tenantId, type: "LabOrderPlaced" } }), 0);
  });

  it("a nurse cannot place a lab order on her own authority: doctor confirmation, prescriber and catalogue codes are required", async () => {
    const base = { items: [{ code: "CBC", nameEn: "CBC" }], prescriber: { name: "Dr Hesham", orderedOn: "2026-11-19" }, confirmedDoctorOrder: true as const };
    assert.equal(await errCode(() => svc.createOrder(w.tenantId, w.clinician.jwt, apptId, { ...base, confirmedDoctorOrder: false as never })), "DOCTOR_ORDER_REQUIRED");
    assert.equal(await errCode(() => svc.createOrder(w.tenantId, w.clinician.jwt, apptId, { ...base, prescriber: { name: "", orderedOn: "2026-11-19" } })), "PRESCRIBER_REQUIRED");
    assert.equal(await errCode(() => svc.createOrder(w.tenantId, w.clinician.jwt, apptId, { ...base, items: [{ code: "", nameEn: "CBC" }] })), "ITEM_CODE_REQUIRED");
    assert.equal(await errCode(() => svc.createOrder(w.tenantId, w.other.jwt, apptId, base)), "ForbiddenException", "not her visit");
  });

  it("consent missing: refused with LAB_HANDOFF_NO_CONSENT, nothing recorded, nothing emitted", async () => {
    const o = await newOrder();
    assert.equal(await errCode(() => svc.recordCollection(w.tenantId, w.clinician.jwt, o.id, good())), "LAB_HANDOFF_NO_CONSENT");
    assert.equal(await prisma.labSampleCollection.count({ where: { tenantId: w.tenantId } }), 0);
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId: w.tenantId, type: "LabOrderPlaced" } }), 0);
  });

  it("safety refusals (identifier mismatch, one identifier, future time, bad hand-over, bad label) write nothing, audit the code only, and never need the flag", async () => {
    await grantConsent();
    const o = (await prisma.clinicalOrder.findFirstOrThrow({ where: { tenantId: w.tenantId, kind: "LAB" }, orderBy: { createdAt: "desc" } })).id;
    const run = (over: Partial<RecordCollectionInput>) => errCode(() => svc.recordCollection(w.tenantId, w.clinician.jwt, o, good(over)));
    assert.equal(await run({ identifiers: [{ kind: "FULL_NAME", value: "Wrong Person" }, { kind: "DATE_OF_BIRTH", value: "1990-01-01" }] }), "IDENTIFIER_MISMATCH");
    assert.equal(await run({ identifiers: [{ kind: "FULL_NAME", value: "Test Patient" }] }), "TWO_IDENTIFIERS_REQUIRED");
    assert.equal(await run({ collectedAt: new Date(Date.now() + 3600_000).toISOString() }), "COLLECTED_IN_FUTURE");
    assert.equal(await run({ collectedAt: new Date(Date.now() - 600_000).toISOString(), handedOverAt: new Date(Date.now() - 900_000).toISOString() }), "HANDOVER_TIME_INVALID");
    assert.equal(await run({ tubes: [{ label: "a b", specimenType: "BLOOD" }] }), "TUBE_LABEL_INVALID");
    assert.equal(await run({ tubes: [] }), "TUBE_REQUIRED");
    assert.equal(await prisma.labSampleCollection.count({ where: { tenantId: w.tenantId } }), 0);
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId: w.tenantId, type: "LabOrderPlaced" } }), 0);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: w.tenantId, action: "LAB_SAMPLE_REFUSED" } });
    assert.ok(audits.length >= 6);
    assert.ok(!JSON.stringify(audits.map((a) => a.metadata)).includes("Wrong Person"), "audit never stores identifier values");
    // flag OFF blocks the whole NEW action first (403); the checks above are flag-free code and run on every collection when it is ON
    assert.equal(await errCode(() => offSvc.recordCollection(w.tenantId, w.clinician.jwt, o, good())), "FEATURE_DISABLED");
  });

  it("happy path: records tubes/time/temperature/identifier kinds, emits ONE LabOrderPlaced with the consent token and nurseCollection, stores only the token hash", async () => {
    const o = (await prisma.clinicalOrder.findFirstOrThrow({ where: { tenantId: w.tenantId, kind: "LAB" }, orderBy: { createdAt: "desc" } })).id;
    const collectedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const r = await svc.recordCollection(w.tenantId, w.clinician.jwt, o, good({ collectedAt, handedOverAt: new Date(Date.now() - 5 * 60_000).toISOString() }));
    assert.equal(r.alreadyHandedOff, false);
    assert.equal(r.labStatus, "HANDED_OFF");
    assert.deepEqual(r.identifiersChecked, ["fullName", "dateOfBirth"]);
    assert.equal(r.tubes[0]!.label, `NRS-${suffix}-A`);
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: w.tenantId, type: "LabOrderPlaced" } });
    assert.equal(ev.length, 1);
    const d = ev[0]!.payload as Record<string, any>;
    assert.equal(d.orderId, o);
    assert.match(d.consentToken, /^rsc_/);
    assert.equal(d.originEdition, "NURSE");
    assert.equal(d.prescriberName, "Dr Hesham Nabil");
    assert.equal(d.nurseCollection.visitRef, apptId);
    assert.equal(d.nurseCollection.samples[0].label, `NRS-${suffix}-A`);
    assert.equal(d.nurseCollection.temperatureC, 5);
    assert.equal(d.patient.fullName, "Test Patient");
    assert.ok(!("nationalId" in d.patient));
    const row = await prisma.labSampleCollection.findUniqueOrThrow({ where: { orderId: o } });
    assert.match(row.consentTokenHash, /^[0-9a-f]{64}$/);
    assert.notEqual(row.consentTokenHash, d.consentToken);
    assert.equal((await prisma.clinicalOrder.findUniqueOrThrow({ where: { id: o } })).status, "IN_PROGRESS");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: w.tenantId, action: "LAB_SAMPLE_COLLECTED" } });
    assert.ok(!JSON.stringify(audit.metadata).includes("Test Patient") && !JSON.stringify(audit.metadata).includes(d.consentToken));
    // idempotent
    const again = await svc.recordCollection(w.tenantId, w.clinician.jwt, o, good());
    assert.equal(again.alreadyHandedOff, true);
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId: w.tenantId, type: "LabOrderPlaced" } }), 1);
  });

  it("a tube label already recorded in this tenant is refused (409 TUBE_LABEL_DUPLICATE)", async () => {
    const o2 = await newOrder();
    assert.equal(await errCode(() => svc.recordCollection(w.tenantId, w.clinician.jwt, o2.id, good())), "TUBE_LABEL_DUPLICATE");
  });

  it("status push from Kiorex: monotonic, custody mirrored without PHI, RELEASED marks results ready and keeps only the secure link", async () => {
    const o = (await prisma.labSampleCollection.findFirstOrThrow({ where: { tenantId: w.tenantId } })).orderId;
    const custody = [{ label: `NRS-${suffix}-A`, type: "COLLECTED", occurredAt: new Date(Date.now() - 20 * 60_000).toISOString(), by: "NURSE" as const, temperatureC: 5 }, { label: `NRS-${suffix}-A`, type: "RECEIVED", occurredAt: new Date().toISOString(), by: "LAB" as const }];
    assert.equal((await svc.applyLabStatus(o, { status: "COLLECTED", labOrderNumber: "LAB-1", custody })).applied, true);
    assert.equal((await svc.applyLabStatus(o, { status: "IN_LAB" })).status, "IN_LAB");
    const back = await svc.applyLabStatus(o, { status: "COLLECTED" });
    assert.equal(back.applied, false, "a stale push cannot move the status back");
    assert.equal((await svc.custody(w.tenantId, o)).labStatus, "IN_LAB");
    const view = await svc.custody(w.tenantId, o);
    assert.equal(view.custody.filter((e) => e.type === "COLLECTED").length, 1);
    assert.ok(view.custody.some((e) => e.by === "LAB" && e.type === "RECEIVED"));
    assert.equal(view.labOrderNumber, "LAB-1");
    assert.equal(view.result, null);
    const rel = await svc.applyLabStatus(o, { status: "RELEASED", reportId: "rep_1", reportVersion: 1, secureLink: "https://lab.example/r/abc", signedAt: new Date().toISOString() });
    assert.equal(rel.status, "RELEASED");
    const done = await svc.custody(w.tenantId, o);
    assert.equal(done.result?.secureLink, "https://lab.example/r/abc");
    const ord = await prisma.clinicalOrder.findUniqueOrThrow({ where: { id: o } });
    assert.equal(ord.status, "RESULTS_READY");
    assert.ok(ord.resultsReadyAt);
    assert.equal(ord.resultsJson, null, "no result values ever");
    assert.equal(await errCode(() => svc.applyLabStatus("nope", { status: "COLLECTED" })), "LAB_HANDOFF_NOT_FOUND");
    assert.equal(await errCode(() => svc.applyLabStatus(o, { status: "WEIRD" })), "UNKNOWN_LAB_STATUS");
  });

  it("reads keep working with the flag OFF (OFF blocks new actions, never hides data)", async () => {
    const o = (await prisma.labSampleCollection.findFirstOrThrow({ where: { tenantId: w.tenantId } })).orderId;
    assert.equal((await offSvc.custody(w.tenantId, o)).orderId, o);
    assert.ok((await offSvc.listForVisit(w.tenantId, w.clinician.jwt, { appointmentId: apptId })).length >= 1);
  });
});
