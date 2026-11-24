import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { EncounterStatus, Gender, RecordShareScope, UserRole } from "@prisma/client";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { RecordShareService } from "./record-share.service";
import { signPayload } from "./record-share.service";

const prisma = createPrismaClient();

/** GRW-GC-2 G-10: structured Rx lines and the follow-up interval travel beside the signed documents, never inside the signed visit summary. */
describe("GRW-GC-2 Rx items[] and followUp.intervalDays (real Postgres)", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let encounterId: string;
  let patientId: string;
  let svc: RecordShareService;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    tenantId = (await prisma.tenant.create({ data: { name: `GC2RX ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" } })).id;
    const clinicId = (await prisma.clinic.create({ data: { tenantId, nameEn: "GC2", nameAr: "جي", country: "EG", city: "Cairo", addressEn: "a", addressAr: "ا", locationUrl: "https://maps.example/gc2", timezone: "Africa/Cairo", phone: "201000000312", email: `gc2rx.${suffix}@example.com`, licenseNumber: `EG-GC2-${suffix}`, defaultCurrency: "EGP" } })).id;
    const clinicianId = (await prisma.user.create({ data: { tenantId, email: `gc2rx.dr.${suffix}@example.com`, passwordHash: "x", displayName: "Dr", role: UserRole.PHYSICIAN } })).id;
    patientId = (await prisma.patient.create({ data: { tenantId, mrn: `GC2-${suffix}`, firstNameEn: "A", lastNameEn: "B", gender: Gender.M, phone: `2011${suffix.slice(-8)}`, homeBranchId: clinicId } })).id;
    encounterId = (await prisma.encounter.create({ data: { tenantId, clinicId, patientId, clinicianId, visitType: "CONSULTATION", status: EncounterStatus.FINALIZED, signedAt: new Date(), finalizedAt: new Date(), signedByUserId: clinicianId, subjective: "well", plan: "rest", followUpWeeks: 2 } })).id;
    await prisma.encounterMedication.createMany({
      data: [
        { tenantId, encounterId, drugName: "Amoxicillin 500mg", dosage: "1 capsule", frequency: "3 times daily", duration: "7 days" },
        { tenantId, encounterId, drugName: "Paracetamol", dosage: "500mg", frequency: "if needed", duration: "as needed" },
      ],
    });
    svc = new RecordShareService(prisma as unknown as PrismaService);
    await svc.upsertConsents(tenantId, patientId, [{ scope: RecordShareScope.VISIT_SUMMARY, granted: true }, { scope: RecordShareScope.PRESCRIPTIONS, granted: true }], "CLINIC");
  });
  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } });
    await prisma.patientRecordShareConsent.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.encounterMedication.deleteMany({ where: { tenantId } });
    await prisma.encounter.deleteMany({ where: { tenantId } });
    await prisma.patient.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.clinic.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("PRESCRIPTION_SHARED carries items[] with name, dose, frequency and durationDays when it parses; the PDF link is unchanged", async () => {
    const shared = await svc.shareAfterSignOff(tenantId, encounterId);
    assert.deepEqual([...shared!.shared].sort(), ["PRESCRIPTIONS", "VISIT_SUMMARY"]);
    const rx = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: OUTBOX_EVENT.PRESCRIPTION_SHARED } });
    const p = rx.payload as { items?: Record<string, unknown>[]; pdf?: { url: string }; patientId: string };
    assert.deepEqual(p.items, [
      { name: "Amoxicillin 500mg", dose: "1 capsule", frequency: "3 times daily", durationDays: 7 },
      { name: "Paracetamol", dose: "500mg", frequency: "if needed" },
    ]);
    assert.ok(p.pdf?.url);
    assert.equal(p.patientId, patientId);
  });

  it("VISIT_SUMMARY_SHARED carries followUp.intervalDays beside the summary and the signature still verifies over the summary alone", async () => {
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: OUTBOX_EVENT.VISIT_SUMMARY_SHARED } });
    const p = ev.payload as { summary: { encounterId: string; clinicId: string; signedAt: string; soap: Record<string, string | null> }; signature: string; followUp?: { intervalDays: number } };
    assert.deepEqual(p.followUp, { intervalDays: 14 });
    // jsonb does not keep key order, so rebuild the summary in the order the service signs it (the consumer verifies the wire body, not the stored copy)
    const s = p.summary;
    const wire = { encounterId: s.encounterId, clinicId: s.clinicId, signedAt: s.signedAt, soap: { chiefComplaint: s.soap.chiefComplaint, subjective: s.soap.subjective, objective: s.soap.objective, assessment: s.soap.assessment, plan: s.soap.plan } };
    assert.equal(p.signature, signPayload(wire), "adding followUp did not change what is signed");
    assert.ok(!JSON.stringify(p.summary).includes("intervalDays"));
  });

  it("an encounter with no follow-up and no structured data stays as before (no followUp key)", async () => {
    await prisma.encounter.update({ where: { id: encounterId }, data: { followUpWeeks: null } });
    await prisma.outboxEvent.deleteMany({ where: { tenantId } });
    await svc.shareAfterSignOff(tenantId, encounterId);
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: OUTBOX_EVENT.VISIT_SUMMARY_SHARED } });
    assert.ok(!("followUp" in (ev.payload as object)));
  });
});
