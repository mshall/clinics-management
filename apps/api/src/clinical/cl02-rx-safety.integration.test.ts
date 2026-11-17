import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PatientAllergyCode, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { EncountersService } from "../encounters/encounters.service";

const prisma = new PrismaClient();

describe("CL-02 Rx safety on save", () => {
  let tenantId: string;
  let patientId: string;
  let encounterId: string;
  let clinicianId: string;
  let clinicId: string;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    clinicId = clinic.id;
    const clinician = await prisma.user.findFirstOrThrow({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });
    clinicianId = clinician.id;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `CL02-${Date.now()}`,
        firstNameEn: "Rx",
        lastNameEn: "Safety",
        gender: "UNKNOWN",
        phone: "+201066655544",
      },
    });
    patientId = patient.id;
    await prisma.patientAllergy.create({
      data: { tenantId, patientId, code: PatientAllergyCode.AMOXICILLIN },
    });
    const enc = await prisma.encounter.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId,
        visitType: "Office visit",
        status: "DRAFT",
      },
    });
    encounterId = enc.id;
    const product = await prisma.drugProduct.findFirst({
      where: { marketId: (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { marketId: true } })).marketId! },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (product && product.ingredients.some((i) => i.ingredient.nameEn.toLowerCase().includes("amoxicillin"))) {
      await prisma.encounterMedication.deleteMany({ where: { encounterId } });
    }
  });

  after(async () => {
    await prisma.encounterMedication.deleteMany({ where: { encounterId } }).catch(() => undefined);
    await prisma.encounter.delete({ where: { id: encounterId } }).catch(() => undefined);
    await prisma.patientAllergy.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("override reason stored on medication and audited", async () => {
    const product = await prisma.drugProduct.findFirst({
      where: {
        brandNameEn: { contains: "Augmentin", mode: "insensitive" },
        isActive: true,
      },
    });
    if (!product) {
      return;
    }
    const prismaSvc = prisma as unknown as PrismaService;
    const audit = new AuditService(prismaSvc);
    const rx = new RxSafetyCheckService(prismaSvc);
    const drugCatalog = new DrugCatalogService(prismaSvc);
    const encounters = new EncountersService(
      prismaSvc,
      {} as never,
      {} as never,
      {} as never,
      drugCatalog,
      rx,
      audit,
      {} as never,
    );
    const priorAudit = await prisma.auditLog.count({
      where: { tenantId, action: "RX_SAFETY_OVERRIDE", resourceId: encounterId },
    });
    const row = await encounters.addMedication(
      tenantId,
      encounterId,
      {
        drugName: product.brandNameEn,
        drugProductId: product.id,
        safetyOverrideReason: "Benefit outweighs risk — reviewed with patient",
      },
      { userId: clinicianId, tenantId, role: "PHYSICIAN" } as never,
    );
    assert.equal(row.safetyOverrideReason, "Benefit outweighs risk — reviewed with patient");
    const afterAudit = await prisma.auditLog.count({
      where: { tenantId, action: "RX_SAFETY_OVERRIDE", resourceId: encounterId },
    });
    assert.ok(afterAudit > priorAudit);
    await prisma.encounterMedication.delete({ where: { id: row.id } });
  });
});