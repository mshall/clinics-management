import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { TenantExportService } from "./tenant-export.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("SC-05 tenant export integration", () => {
  let tenantId: string;
  let owner: JwtUser;
  let prevStatus: SubscriptionStatus | null = null;
  let svc: TenantExportService;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    const user = await prisma.user.findFirstOrThrow({
      where: { tenantId, isTenantOwner: true },
      select: { id: true, email: true, role: true, additionalRoles: true },
    });
    owner = {
      userId: user.id,
      tenantId,
      email: user.email,
      role: user.role,
      additionalRoles: user.additionalRoles,
      isTenantOwner: true,
    };
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    prevStatus = sub?.status ?? null;
    if (sub) {
      await prisma.subscription.update({
        where: { tenantId },
        data: { status: SubscriptionStatus.SUSPENDED },
      });
    }
    svc = new TenantExportService(prisma as unknown as PrismaService);
  });

  after(async () => {
    if (prevStatus) {
      await prisma.subscription.update({ where: { tenantId }, data: { status: prevStatus } });
    }
    await prisma.$disconnect();
  });

  it("export works in SUSPENDED state", async () => {
    const job = await svc.requestTenantExport(tenantId, owner);
    assert.equal(job.status, "READY");
    assert.ok("downloadToken" in job && typeof (job as { downloadToken?: string }).downloadToken === "string");
    assert.ok((job.rowCounts as { patients?: number })?.patients != null);
  });
});
