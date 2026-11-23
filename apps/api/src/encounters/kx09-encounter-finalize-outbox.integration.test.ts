import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, EncounterStatus, PrismaClient, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { DrugCatalogService } from "../clinical/drug-catalog.service";
import { RxSafetyCheckService } from "../clinical/rx-safety-check.service";
import type { JwtUser } from "../auth/jwt-user";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { EncountersService } from "./encounters.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

/** KX-09 §04 / KXM-LC: completing a Kiorex visit by signing its encounter must tell Kiorex (COMPLETED + review invitation). */
describe("KX-09 finalizing the encounter completes the visit and emits COMPLETED", () => {
  const stamp = Date.now();
  let tenantId: string;
  let doctor: JwtUser;
  let patientId: string;
  let appointmentId: string;
  let encounterId: string;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    const doc = await prisma.user.findFirstOrThrow({ where: { tenantId, deletedAt: null, role: UserRole.PHYSICIAN } });
    doctor = { userId: doc.id, tenantId, role: doc.role, email: doc.email } as JwtUser;
    const patient = await prisma.patient.create({
      data: { tenantId, mrn: `KX09E-${stamp}`, firstNameEn: "Fin", lastNameEn: "Alize", gender: "UNKNOWN", phone: "+201055500009" },
    });
    patientId = patient.id;
    const start = new Date(Date.now() - 3600_000);
    const apt = await prisma.appointment.create({
      data: {
        tenantId, clinicId: clinic.id, patientId, clinicianId: doc.id, startsAt: start, endsAt: new Date(start.getTime() + 1800_000),
        status: AppointmentStatus.CHECKED_IN, bookingSource: BookingSource.KIOREX_MARKETPLACE, feeAmount: 0,
      },
    });
    appointmentId = apt.id;
    const enc = await prisma.encounter.create({
      data: {
        tenantId, clinicId: clinic.id, patientId, clinicianId: doc.id, appointmentId, visitType: "Office visit", status: EncounterStatus.DRAFT,
        noMedications: true, diagnoses: { create: { tenantId, icd10Code: "J02.9", descriptionEn: "Pharyngitis", isPrimary: true } },
      },
    });
    encounterId = enc.id;
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: appointmentId } }).catch(() => undefined);
    await prisma.encounter.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("emits COMPLETED and REVIEW_INVITATION_ELIGIBLE in the finalize transaction", async () => {
    const svc = new EncountersService(
      prismaSvc,
      {} as never,
      { onEncounterEnded: async () => undefined } as never,
      {} as never,
      new DrugCatalogService(prismaSvc),
      new RxSafetyCheckService(prismaSvc),
      new AuditService(prismaSvc),
      { put: async () => undefined, deleteObject: async () => undefined } as never,
      { onComplete: async () => undefined } as never,
      { shareAfterSignOff: async () => null } as never,
      new AppointmentOutboxService(new OutboxEventService(prismaSvc)),
      { enqueueProcessDocument: async () => undefined } as never,
    );
    await svc.finalize(tenantId, doctor, encounterId);
    const apt = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    assert.equal(apt.status, AppointmentStatus.COMPLETED);
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: appointmentId } });
    const types = events.map((e) => e.type).sort();
    assert.ok(types.includes("COMPLETED"), `expected COMPLETED in ${types.join(",")}`);
    assert.ok(types.includes("REVIEW_INVITATION_ELIGIBLE"), `expected REVIEW_INVITATION_ELIGIBLE in ${types.join(",")}`);
  });
});
