import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import * as bcrypt from "bcryptjs";
import { AppointmentStatus, PrismaClient } from "@prisma/client";
import { ensurePlanCatalog } from "../../prisma/plan-catalog-seed";
import { resetSalesDemoTenant, summarizePilotTenant } from "./sales-demo-reset";
import { PILOT_TENANT_SPECS } from "./pilot-tenant-catalog";

const prisma = new PrismaClient();

describe("QA-06 sales demo reset", () => {
  const passwordHash = bcrypt.hashSync("demo", 10);

  before(async () => {
    await prisma.$connect();
    await ensurePlanCatalog(prisma);
    process.env.ALLOW_DEMO_RESET = "true";
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("one command clears transactional demo data and restores patients", async () => {
    const spec = PILOT_TENANT_SPECS.pro;
    const { tenantId } = await resetSalesDemoTenant(prisma, "pro", passwordHash);

    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId: (await prisma.clinic.findFirstOrThrow({ where: { tenantId } })).id,
        patientId: (await prisma.patient.findFirstOrThrow({ where: { tenantId } })).id,
        clinicianId: (
          await prisma.user.findFirstOrThrow({
            where: { tenantId, email: spec.adminEmail.replace("@", "+physician@") },
          })
        ).id,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3_600_000),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const beforeReset = await prisma.appointment.count({ where: { tenantId } });
    assert.ok(beforeReset >= 1);

    await resetSalesDemoTenant(prisma, "pro", passwordHash);

    const after = await summarizePilotTenant(prisma, tenantId);
    assert.equal(after.appointments, 0);
    assert.equal(after.patients, 3);
  });
});