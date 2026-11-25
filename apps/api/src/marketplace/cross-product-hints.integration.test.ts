import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { EncounterStatus, Gender, RecordShareScope, UserRole } from "@prisma/client";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { RecordShareService } from "./record-share.service";

const prisma = createPrismaClient();
const contracts = join(__dirname, "../../../../../kiorex-contracts/events");
const schema = (n: string) => JSON.parse(readFileSync(join(contracts, `${n}.schema.json`), "utf8")) as { properties: { data: { required: string[]; properties: Record<string, unknown> } } };

/** Contracts 1.13.0 cross-product hints: optional `appointmentId` on PRESCRIPTION_SHARED, the new CARE_PLAN_SUGGESTED event (ids only, consent gated, idempotent). Real Postgres. */
describe("cross-product hints (appointmentId, CARE_PLAN_SUGGESTED)", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string; let clinicId: string; let patientId: string; let clinicianId: string; let appointmentId: string; let encWith: string; let encWithout: string; let encUnsigned: string;
  let svc: RecordShareService;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    tenantId = (await prisma.tenant.create({ data: { name: `XPH ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" } })).id;
    clinicId = (await prisma.clinic.create({ data: { tenantId, nameEn: "XPH", nameAr: "اكس", country: "EG", city: "Cairo", addressEn: "a", addressAr: "ا", locationUrl: "https://maps.example/xph", timezone: "Africa/Cairo", phone: "201000000413", email: `xph.${suffix}@example.com`, licenseNumber: `EG-XPH-${suffix}`, defaultCurrency: "EGP" } })).id;
    clinicianId = (await prisma.user.create({ data: { tenantId, email: `xph.dr.${suffix}@example.com`, passwordHash: "x", displayName: "Dr", role: UserRole.PHYSICIAN } })).id;
    patientId = (await prisma.patient.create({ data: { tenantId, mrn: `XPH-${suffix}`, firstNameEn: "A", lastNameEn: "B", gender: Gender.M, phone: `2012${suffix.slice(-8)}`, homeBranchId: clinicId } })).id;
    appointmentId = (await prisma.appointment.create({ data: { tenantId, clinicId, patientId, clinicianId, startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() - 1800_000) } })).id;
    const base = { tenantId, clinicId, patientId, clinicianId, visitType: "CONSULTATION", status: EncounterStatus.FINALIZED, signedAt: new Date(), finalizedAt: new Date(), signedByUserId: clinicianId };
    encWith = (await prisma.encounter.create({ data: { ...base, appointmentId, subjective: "SECRET-SOAP" } })).id;
    encWithout = (await prisma.encounter.create({ data: { ...base } })).id;
    encUnsigned = (await prisma.encounter.create({ data: { tenantId, clinicId, patientId, clinicianId, visitType: "CONSULTATION", status: EncounterStatus.DRAFT } })).id;
    for (const id of [encWith, encWithout]) await prisma.encounterMedication.create({ data: { tenantId, encounterId: id, drugName: "Panadol 500mg", dosage: "1 tab", frequency: "TID", duration: "5 days" } });
    svc = new RecordShareService(prisma as unknown as PrismaService);
  });
  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } });
    await prisma.patientRecordShareConsent.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.encounterMedication.deleteMany({ where: { tenantId } });
    await prisma.encounter.deleteMany({ where: { tenantId } });
    await prisma.appointment.deleteMany({ where: { tenantId } });
    await prisma.patient.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.clinic.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("the contract lists appointmentId as OPTIONAL on both events and CARE_PLAN_SUGGESTED requires ids and a time only", () => {
    for (const n of ["PRESCRIPTION_SHARED", "LabOrderPlaced"]) {
      const s = schema(n).properties.data;
      assert.ok("appointmentId" in s.properties, n);
      assert.ok(!s.required.includes("appointmentId"), n);
    }
    const c = schema("CARE_PLAN_SUGGESTED").properties.data;
    assert.deepEqual([...c.required].sort(), ["clinicId", "encounterId", "patientId", "suggestedAt"]);
    assert.equal(OUTBOX_EVENT.CARE_PLAN_SUGGESTED, "CARE_PLAN_SUGGESTED");
  });

  it("PRESCRIPTION_SHARED carries appointmentId when the encounter has one and omits the key when it does not", async () => {
    await svc.upsertConsents(tenantId, patientId, [{ scope: RecordShareScope.VISIT_SUMMARY, granted: true }, { scope: RecordShareScope.PRESCRIPTIONS, granted: true }], "CLINIC");
    await svc.shareAfterSignOff(tenantId, encWith);
    await svc.shareAfterSignOff(tenantId, encWithout);
    const a = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: OUTBOX_EVENT.PRESCRIPTION_SHARED, aggregateId: encWith } });
    const b = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: OUTBOX_EVENT.PRESCRIPTION_SHARED, aggregateId: encWithout } });
    assert.equal((a.payload as { appointmentId?: string }).appointmentId, appointmentId);
    assert.ok(!("appointmentId" in (b.payload as object)));
  });

  it("CARE_PLAN_SUGGESTED: ids and a time only, once per encounter, never for an unsigned visit", async () => {
    assert.deepEqual(await svc.suggestCarePlan(tenantId, encUnsigned), { suggested: false, reason: "NOT_SIGNED" });
    assert.deepEqual(await svc.suggestCarePlan(tenantId, encWith), { suggested: true });
    assert.deepEqual(await svc.suggestCarePlan(tenantId, encWith), { suggested: false, reason: "ALREADY_SUGGESTED" });
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: OUTBOX_EVENT.CARE_PLAN_SUGGESTED } });
    const p = ev.payload as Record<string, unknown>;
    assert.deepEqual(Object.keys(p).sort(), ["aggregateId", "aggregateType", "appointmentId", "clinicId", "encounterId", "patientId", "suggestedAt"]);
    assert.equal(p.appointmentId, appointmentId);
    assert.ok(!JSON.stringify(p).includes("SECRET"), "no clinical content leaves with the prompt");
    assert.equal(ev.target, "KIOREX");
  });

  it("CARE_PLAN_SUGGESTED needs the active visit-summary consent: withdrawn consent sends nothing", async () => {
    await svc.upsertConsents(tenantId, patientId, [{ scope: RecordShareScope.VISIT_SUMMARY, granted: false }], "CLINIC");
    assert.deepEqual(await svc.suggestCarePlan(tenantId, encWithout), { suggested: false, reason: "NO_CONSENT" });
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId, type: OUTBOX_EVENT.CARE_PLAN_SUGGESTED, aggregateId: encWithout } }), 0);
  });
});
