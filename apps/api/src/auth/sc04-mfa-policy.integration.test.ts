import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { JwtUser } from "./jwt-user";
import { PrivilegedMfaGuard } from "./privileged-mfa.guard";
import type { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaClient();

describe("SC-04 MFA policy integration", () => {
  let ownerId: string;
  let guard: PrivilegedMfaGuard;
  const prevEnforce = process.env.PRIVILEGED_MFA_ENFORCE;

  before(async () => {
    await prisma.$connect();
    process.env.PRIVILEGED_MFA_ENFORCE = "true";
    const owner = await prisma.user.findFirstOrThrow({
      where: { isTenantOwner: true },
      select: { id: true, tenantId: true, email: true, role: true, additionalRoles: true, createdAt: true },
    });
    ownerId = owner.id;
    // Force past grace for this test.
    await prisma.user.update({
      where: { id: ownerId },
      data: { createdAt: new Date(Date.now() - 10 * 86_400_000), mfaEnabled: false },
    });
    guard = new PrivilegedMfaGuard(prisma as unknown as PrismaService);
  });

  after(async () => {
    if (prevEnforce === undefined) delete process.env.PRIVILEGED_MFA_ENFORCE;
    else process.env.PRIVILEGED_MFA_ENFORCE = prevEnforce;
    await prisma.$disconnect();
  });

  it("owner cannot access billing without MFA after day 7", async () => {
    const user: JwtUser = {
      userId: ownerId,
      tenantId: (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).tenantId!,
      email: "owner@test",
      role: "GROUP_ADMIN" as never,
      isTenantOwner: true,
    };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          originalUrl: "/api/v1/billing/invoices",
          path: "/api/v1/billing/invoices",
        }),
      }),
    };
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) =>
        err instanceof UnauthorizedException &&
        JSON.stringify(err.getResponse()).includes("MFA_SETUP_REQUIRED"),
    );
  });
});
