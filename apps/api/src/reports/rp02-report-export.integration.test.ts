import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { FinancialVisibilityOverride, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { ReportsExportService } from "./reports-export.service";
import { ReportsService } from "./reports.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

function isMoneyDenied(err: unknown): boolean {
  return (
    err instanceof ForbiddenException &&
    JSON.stringify(err.getResponse()).includes("MONEY_VISIBILITY_DENIED")
  );
}

const prisma = createPrismaClient();

describe("RP-02 report export integration", () => {
  let tenantId: string;
  let exports: ReportsExportService;
  let owner: JwtUser;
  let receptionist: JwtUser;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    const ownerRow = await prisma.user.findFirstOrThrow({
      where: { tenantId, isTenantOwner: true },
      select: { id: true, role: true, additionalRoles: true, email: true },
    });
    owner = {
      userId: ownerRow.id,
      tenantId,
      email: ownerRow.email,
      role: ownerRow.role,
      roles: [ownerRow.role, ...ownerRow.additionalRoles],
    } as JwtUser;

    const desk = await prisma.user.findFirst({
      where: {
        tenantId,
        OR: [{ role: UserRole.RECEPTIONIST }, { additionalRoles: { has: UserRole.RECEPTIONIST } }],
      },
      select: { id: true, role: true, additionalRoles: true, email: true },
    });
    receptionist = desk
      ? ({
          userId: desk.id,
          tenantId,
          email: desk.email,
          role: desk.role,
          roles: [desk.role, ...desk.additionalRoles],
        } as JwtUser)
      : ({
          userId: "missing-desk",
          tenantId,
          email: "desk@test.local",
          role: UserRole.RECEPTIONIST,
          roles: [UserRole.RECEPTIONIST],
        } as JwtUser);

    const reports = new ReportsService(prisma as unknown as PrismaService, {
      ensureForRange: async () => undefined,
    } as never);
    exports = new ReportsExportService(prisma as unknown as PrismaService, reports);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("owner can export payments as xlsx; RBAC money hide denies", async () => {
    const result = await exports.export(tenantId, "payments", "xlsx", "2020-01-01", "2030-12-31", undefined, owner);
    assert.equal(result.format, "xlsx");
    assert.ok(result.body.length > 50);
    assert.ok(result.filename.includes("payments"));
    assert.ok(result.contentType.includes("excel"));

    await prisma.userMoneyVisibilityOverride.upsert({
      where: { userId: owner.userId },
      create: {
        tenantId,
        userId: owner.userId,
        operationsOverride: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT,
      },
      update: { operationsOverride: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT },
    });
    try {
      await assert.rejects(
        () => exports.export(tenantId, "payments", "xlsx", "2020-01-01", "2030-12-31", undefined, owner),
        isMoneyDenied,
      );
    } finally {
      await prisma.userMoneyVisibilityOverride.deleteMany({ where: { userId: owner.userId } });
    }
  });

  it("receptionist without money role is denied payments export", async () => {
    if (receptionist.userId === "missing-desk") return;
    await assert.rejects(
      () => exports.export(tenantId, "payments", "pdf", "2020-01-01", "2030-12-31", undefined, receptionist),
      isMoneyDenied,
    );
  });

  it("schedule upsert persists weekly delivery prefs", async () => {
    const row = await exports.putSchedule(tenantId, {
      enabled: true,
      format: "pdf",
      reportKeys: ["payments", "operations"],
      dayOfWeek: 1,
      hourLocal: 9,
      channelEmail: true,
      channelWhatsApp: true,
    });
    assert.equal(row.format, "pdf");
    assert.equal(row.dayOfWeek, 1);
    const got = await exports.getSchedule(tenantId);
    assert.equal(got.enabled, true);
  });
});
