import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, PrismaClient } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";
import { noShowRate } from "./operations-kpis";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("RP-01 operations report integration", () => {
  let tenantId: string;
  let clinicId: string;
  let reports: ReportsService;
  let owner: JwtUser;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    clinicId = clinic.id;
    const user = await prisma.user.findFirstOrThrow({
      where: { tenantId, isTenantOwner: true },
      select: { id: true, role: true, additionalRoles: true, tenantId: true, email: true },
    });
    owner = {
      userId: user.id,
      tenantId,
      email: user.email,
      role: user.role,
      roles: [user.role, ...user.additionalRoles],
    } as JwtUser;
    reports = new ReportsService(prisma as unknown as PrismaService, { ensurePayrollForRange: async () => undefined } as never);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("operations KPI numbers reconcile with raw appointment outcomes", async () => {
    const from = "2020-01-01";
    const to = "2030-12-31";
    const raw = await prisma.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        startsAt: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
        patient: { isSample: false },
        status: { in: [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW] },
      },
      select: {
        id: true,
        status: true,
        clinicianId: true,
        appointmentTypeId: true,
        startsAt: true,
        endsAt: true,
        bookingSource: true,
        isNewPatientAtBooking: true,
      },
    });
    const expected = noShowRate(
      raw.map((r) => ({
        ...r,
        durationMinutes: null,
      })),
    );
    const report = await reports.operationsReport(tenantId, from, to, clinicId, owner);
    assert.equal(report.noShow.total, expected.total);
    assert.equal(report.noShow.noShows, expected.noShows);
    assert.equal(report.noShow.rate, expected.rate);
    assert.ok(Array.isArray(report.bookingSources));
    assert.ok(typeof report.utilisation.percent === "number");
  });
});
