import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Gender, PrismaClient, SupportAccessStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { SupportAccessSessionService } from "./support-access-session.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const access = new SupportAccessSessionService(prismaSvc);

describe("PA-04 support access with consent & audit", () => {
  const suffix = `pa04-${Date.now()}`;
  let platformUser: JwtUser;
  let owner: JwtUser;
  let tenantId: string;
  let patientId: string;

  before(async () => {
    await prisma.$connect();
    const platform = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(platform);
    platformUser = {
      userId: platform.id,
      tenantId: null,
      email: platform.email,
      role: UserRole.PLATFORM_SUPER_ADMIN,
    };

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Support ${suffix}`,
        nameAr: `Support ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    tenantId = tenant.id;
    const ownerRow = await prisma.user.create({
      data: {
        tenantId,
        email: `owner-${suffix}@example.com`,
        passwordHash: "x",
        displayName: "Owner PA04",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    owner = {
      userId: ownerRow.id,
      tenantId,
      email: ownerRow.email,
      role: UserRole.GROUP_ADMIN,
      isTenantOwner: true,
    };
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MRN-PA04-${suffix.slice(-6)}`,
        firstNameEn: "Sara",
        lastNameEn: "Hassan",
        firstNameAr: "سارة",
        lastNameAr: "حسن",
        phone: "+201001234567",
        nationalId: "29801011234567",
        gender: Gender.F,
        dob: new Date("1998-01-01"),
      },
    });
    patientId = patient.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("blocks patient chart without an active approved session", async () => {
    await assert.rejects(async () => access.openPatientChart(platformUser, tenantId, patientId), (e) => {
      if (!(e instanceof ForbiddenException)) return false;
      const body = e.getResponse() as { code?: string } | string;
      if (typeof body === "string") return body.includes("SUPPORT_ACCESS_REQUIRED");
      return body.code === "SUPPORT_ACCESS_REQUIRED";
    });
  });

  it("allows masked chart only after owner approval and audits the read", async () => {
    const req = await access.requestAccess(platformUser, {
      tenantId,
      reason: "Investigate billing ticket",
      durationMinutes: 30,
      requestedUnmaskPhi: true,
    });
    assert.equal(req.status, SupportAccessStatus.PENDING);

    await assert.rejects(async () => access.openPatientChart(platformUser, tenantId, patientId));

    const approved = await access.decide(owner, req.id, { approved: true, allowUnmaskPhi: false });
    assert.equal(approved.status, SupportAccessStatus.APPROVED);
    assert.equal(approved.phiUnmasked, false);

    const chart = await access.openPatientChart(platformUser, tenantId, patientId);
    assert.equal(chart.phiMasked, true);
    assert.ok(chart.phone?.startsWith("***"));
    assert.ok(chart.nationalId?.endsWith("4567"));
    assert.equal(chart.dateOfBirth, null);

    const readLog = await prisma.supportAccessReadLog.findFirst({
      where: { sessionId: approved.id, patientId, action: "patient.chart.read" },
    });
    assert.ok(readLog);
    assert.equal(readLog.masked, true);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "support.patient_chart_read", resourceId: patientId },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
  });
});
