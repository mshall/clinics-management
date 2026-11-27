import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PatientAllergyCode, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { EncountersService } from "../encounters/encounters.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const suffix = `cl02-${Date.now()}`;

describe("CL-02 Rx safety on save", () => {
  let tenantId: string;
  let patientId: string;
  let encounterId: string;
  let clinicianId: string;
  let clinicId: string;

  before(async () => {
    await prisma.$connect();
    // Self-seeding: the test creates its own organisation, clinic and clinician, so it needs only the migrated database
    // (the EG market comes from the migrations; the drug catalogue is optional: the override case returns early without it).
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    tenantId = (await prisma.tenant.create({ data: { name: `CL02 ${suffix}`, marketId: market.id, deploymentCell: "frankfurt", baseCurrency: "EGP" } })).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId, nameEn: "CL02", nameAr: "ا", addressEn: "x", addressAr: "ا", country: "EG", city: "Cairo",
          locationUrl: "https://maps.example/cl02", timezone: "Africa/Cairo", phone: "201000000202",
          email: `cl02.${suffix}@example.com`, licenseNumber: `EG-CL02-${suffix}`, defaultCurrency: "EGP",
        },
      })
    ).id;
    clinicianId = (
      await prisma.user.create({
        data: { tenantId, email: `cl02.${suffix}@example.com`, displayName: "CL02 Clinician", role: "PHYSICIAN", passwordHash: "not-a-real-hash" },
      })
    ).id;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `CL02-${Date.now()}`,
        firstNameEn: "Rx",
        lastNameEn: "Safety",
        gender: "UNKNOWN",
        phone: "+201000000202",
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
    // the organisation is a throw-away one: remove what was created (best effort; the audit rows are append-only and stay)
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
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
      {} as never,
      { shareAfterSignOff: async () => null } as never,
      { emitStatusChange: async () => undefined } as never,
      { enqueueProcessDocument: async () => undefined } as never,
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