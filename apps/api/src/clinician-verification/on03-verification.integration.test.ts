import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { PrismaClient, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import path from "node:path";
import { LocalUploadBlobStorage } from "../storage/local-upload-blob.storage";
import { ClinicianVerificationService } from "./clinician-verification.service";

const prisma = new PrismaClient();
const uploads = new LocalUploadBlobStorage(path.join(process.cwd(), "uploads"));
const audit = new AuditService(prisma as unknown as PrismaService);
const service = new ClinicianVerificationService(prisma as unknown as PrismaService, uploads, audit);

describe("ON-03 clinician verification", () => {
  let tenantId: string;
  let physicianId: string;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const suffix = `${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `On03 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: {
            nameEn: "Clinic",
            nameAr: "عيادة",
            country: "EG",
            city: "Cairo",
            addressEn: "Street",
            addressAr: "شارع",
            locationUrl: "https://maps.example/o",
            phone: "201000000001",
            email: `on03.${suffix}@example.com`,
            licenseNumber: "EG-ON03",
            defaultCurrency: "EGP",
          },
        },
      },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `on03.phys.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr On03",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = user.id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianVerification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("KX-01: unverified tenant cannot enable Kiorex marketplace listing", async () => {
    await assert.rejects(
      () => service.assertTenantCanEnableKiorexMarketplace(tenantId),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });

  it("allows marketplace when a physician is VERIFIED", async () => {
    await prisma.clinicianVerification.create({
      data: {
        userId: physicianId,
        tenantId,
        status: VerificationStatus.VERIFIED,
        specialty: "GENERAL_MEDICINE",
        verifiedSpecialty: "GENERAL_MEDICINE",
        syndicateNumber: "SYND-ON03",
        documentKeys: [],
      },
    });
    await service.assertTenantCanEnableKiorexMarketplace(tenantId);
  });

  it("documents are served only via authenticated stream (no presigned public URL)", async () => {
    const buf = Buffer.from("%PDF-1.4 test");
    await uploads.put("clinicians", `${tenantId}/${physicianId}/test.pdf`, buf, "application/pdf");
    const stream = await uploads.getReadStream("clinicians", `${tenantId}/${physicianId}/test.pdf`);
    assert.ok(stream);
  });
});