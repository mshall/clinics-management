import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PrismaClient, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import path from "node:path";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LocalUploadBlobStorage } from "../storage/local-upload-blob.storage";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { VERIFICATION_REVIEW_CHECKLIST_KEYS } from "./verification-review-policy";

const prisma = new PrismaClient();
const uploads = new LocalUploadBlobStorage(path.join(process.cwd(), "uploads"));
const audit = new AuditService(prisma as unknown as PrismaService);
const service = new ClinicianVerificationService(prisma as unknown as PrismaService, uploads, audit);

describe("PA-03 verification review queue", () => {
  let tenantId: string;
  let pendingId: string;
  let physicianId: string;
  let platformAdmin: JwtUser;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    const platformUser = await prisma.user.create({
      data: {
        tenantId: null,
        email: `pa03.platform.${suffix}@kiorly.test`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Platform PA03",
        role: UserRole.PLATFORM_SUPER_ADMIN,
      },
    });
    platformAdmin = {
      userId: platformUser.id,
      tenantId: null,
      email: platformUser.email,
      role: UserRole.PLATFORM_SUPER_ADMIN,
      additionalRoles: [],
    };
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Pa03 ${suffix}`,
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
            locationUrl: "https://maps.example/p",
            phone: "201000000099",
            email: `pa03.${suffix}@example.com`,
            licenseNumber: "EG-PA03",
            defaultCurrency: "EGP",
          },
        },
      },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `pa03.phys.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr Pa03",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = user.id;
    const pending = await prisma.clinicianVerification.create({
      data: {
        userId: physicianId,
        tenantId,
        status: VerificationStatus.PENDING,
        specialty: "GENERAL_MEDICINE",
        syndicateNumber: "SYND-PA03",
        pendingAt: new Date(Date.now() - 60 * 60 * 1000),
        documentKeys: [],
      },
    });
    pendingId = pending.id;

    for (const [i, ms] of [[1, 10_000], [2, 30_000], [3, 50_000]] as const) {
      const u = await prisma.user.create({
        data: {
          tenantId,
          email: `pa03.r${i}.${suffix}@example.com`,
          passwordHash: bcrypt.hashSync("demo", 10),
          displayName: `R${i}`,
          role: UserRole.PHYSICIAN,
        },
      });
      await prisma.clinicianVerification.create({
        data: {
          userId: u.id,
          tenantId,
          status: VerificationStatus.VERIFIED,
          reviewDurationMs: ms,
          reviewedAt: new Date(),
          specialty: "GENERAL_MEDICINE",
          verifiedSpecialty: "GENERAL_MEDICINE",
          documentKeys: [],
        },
      });
    }
  });

  after(async () => {
    if (platformAdmin?.userId) {
      await prisma.user.delete({ where: { id: platformAdmin.userId } }).catch(() => undefined);
    }
    await prisma.clinicianVerification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("tracks median review time from completed reviews", async () => {
    const metrics = await service.getPlatformReviewMetrics(platformAdmin);
    assert.ok(metrics.reviewsCounted >= 3);
    assert.ok(metrics.medianReviewMs != null && metrics.medianReviewMs >= 10_000);
    assert.ok(metrics.pendingCount >= 1);
    assert.equal(metrics.slaTargetHours, 48);
  });

  it("requires full checklist before approve", async () => {
    await assert.rejects(
      () =>
        service.platformDecision(platformAdmin, pendingId, {
          decision: "approve",
          checklist: VERIFICATION_REVIEW_CHECKLIST_KEYS.slice(0, 2),
        }),
      (e: unknown) => e instanceof BadRequestException,
    );
  });

  it("records reviewDurationMs on approve with templated checklist", async () => {
    const dto = await service.platformDecision(platformAdmin, pendingId, {
      decision: "approve",
      checklist: [...VERIFICATION_REVIEW_CHECKLIST_KEYS],
    });
    assert.equal(dto.status, VerificationStatus.VERIFIED);
    const row = await prisma.clinicianVerification.findUniqueOrThrow({ where: { id: pendingId } });
    assert.ok(row.reviewDurationMs != null && row.reviewDurationMs > 0);
  });
});