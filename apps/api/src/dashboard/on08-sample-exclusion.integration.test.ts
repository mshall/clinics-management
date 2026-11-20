import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { SampleDataService } from "../onboarding/sample-data.service";
import type { PrismaService } from "../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const ps = prisma as unknown as PrismaService;

describe("ON-08 sample patient excluded from dashboard KPIs", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let owner: JwtUser;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Dash sample ${suffix}`,
        nameAr: "لوحة",
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: {
            nameEn: "Main",
            nameAr: "الرئيسي",
            country: "EG",
            city: "Cairo",
            addressEn: "Street",
            addressAr: "شارع",
            locationUrl: "https://maps.example/d",
            phone: "201000000009",
            email: `on08d.${suffix}@example.com`,
            licenseNumber: "L-9",
            defaultCurrency: "EGP",
          },
        },
      },
    });
    tenantId = tenant.id;
    const u = await prisma.user.create({
      data: { tenantId, email: `on08d.${suffix}@example.com`, displayName: "Dr D", role: UserRole.PHYSICIAN, isTenantOwner: true, passwordHash: "x" },
    });
    owner = { userId: u.id, tenantId, email: u.email, role: UserRole.PHYSICIAN, isTenantOwner: true };
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("today's appointment for the sample patient is not counted", async () => {
    const s = await new SampleDataService(ps, new AuditService(ps)).create(tenantId, owner);
    await prisma.appointment.update({ where: { id: s.appointmentId! }, data: { startsAt: new Date() } });
    const today = await new DashboardService(ps, {} as never).clinicToday(tenantId);
    assert.equal(today.appointments, 0);
  });
});
