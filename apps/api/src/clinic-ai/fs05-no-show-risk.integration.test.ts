import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, Prisma, PrismaClient, UserRole } from "@prisma/client";
import { AppointmentsService } from "../appointments/appointments.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClinicAiService } from "./clinic-ai.service";
import { NoShowRiskScheduler } from "./no-show-risk.scheduler";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

function appointmentsService(entitled: Set<string>) {
  return new AppointmentsService(
    prismaSvc,
    {} as never,
    {} as never,
    { isEnabled: async () => false } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { isEntitled: async (_t: string, key: string) => entitled.has(key) } as never,
    { settleAppointmentDepositsTx: async () => ({ outcome: "WAIT", settled: 0 }) } as never,
  );
}

describe("FS-05 no-show risk on appointments", () => {
  const stamp = Date.now();
  let tenantId: string;
  let riskyAptId: string;
  let reliableAptId: string;

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    const tenant = await prisma.tenant.create({
      data: { name: `FS05 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: `FS05 Branch ${stamp}`,
        nameAr: "فرع",
        country: base.country,
        city: base.city,
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/fs05",
        timezone: base.timezone,
        phone: base.phone,
        email: `fs05.${stamp}@example.com`,
        licenseNumber: `FS05-${stamp}`,
        defaultCurrency: base.defaultCurrency,
      },
    });
    const doc = await prisma.user.create({
      data: { tenantId, email: `fs05.dr.${stamp}@example.com`, passwordHash: "x", displayName: "Dr FS05", role: UserRole.PHYSICIAN },
    });
    const risky = await prisma.patient.create({
      data: { tenantId, mrn: `FS05-R-${stamp}`, firstNameEn: "Often", lastNameEn: "Absent", gender: "UNKNOWN", phone: "+201000005001", noShowCount: 3, requiresAppointmentDeposit: true },
    });
    const reliable = await prisma.patient.create({
      data: { tenantId, mrn: `FS05-OK-${stamp}`, firstNameEn: "Always", lastNameEn: "There", gender: "UNKNOWN", phone: "+201000005002" },
    });
    const tomorrow = new Date(Date.now() + 26 * 3_600_000);
    const mk = (patientId: string, offsetMin: number) =>
      prisma.appointment.create({
        data: {
          tenantId,
          clinicId: clinic.id,
          clinicianId: doc.id,
          patientId,
          startsAt: new Date(tomorrow.getTime() + offsetMin * 60_000),
          endsAt: new Date(tomorrow.getTime() + (offsetMin + 20) * 60_000),
          feeAmount: new Prisma.Decimal("300"),
          status: AppointmentStatus.CONFIRMED,
        },
      });
    riskyAptId = (await mk(risky.id, 0)).id;
    reliableAptId = (await mk(reliable.id, 30)).id;
  });

  after(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("appointment API returns a rule-based band, factors and suggestion (label says rule-based)", async () => {
    const svc = appointmentsService(new Set(["mod_front_desk", "deposits"]));
    const risky = await svc.getById(tenantId, riskyAptId);
    assert.equal(risky.noShowRisk?.method, "RULE_BASED");
    assert.equal(risky.noShowRisk?.band, "HIGH");
    assert.deepEqual(risky.noShowRisk?.factors, ["PRIOR_NO_SHOWS", "DEPOSIT_FLAG"]);
    assert.equal(risky.noShowRisk?.priorNoShows, 3);
    assert.equal(risky.noShowRisk?.suggestion, "EXTRA_REMINDER", "deposit already required → extra reminder");

    const list = await svc.list(tenantId, "1", "10");
    const reliable = list.items.find((a) => a.id === reliableAptId);
    assert.equal(reliable?.noShowRisk?.band, "LOW");
    assert.equal(reliable?.noShowRisk?.suggestion, null);
  });

  it("is hidden below Pro (no front-desk entitlement)", async () => {
    const svc = appointmentsService(new Set());
    const dto = await svc.getById(tenantId, riskyAptId);
    assert.equal(dto.noShowRisk, null);
  });

  it("nightly job stores scores for entitled tenants only", async () => {
    const clinicAi = new ClinicAiService(prismaSvc, {} as never, {} as never);
    const off = new NoShowRiskScheduler(prismaSvc, { isEntitled: async () => false } as never, clinicAi);
    await off.runNightly();
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: riskyAptId } })).noShowRiskScore, null);

    const on = new NoShowRiskScheduler(
      prismaSvc,
      { isEntitled: async (t: string, key: string) => t === tenantId && key === "mod_front_desk" } as never,
      clinicAi,
    );
    const r = await on.runNightly();
    assert.equal(r.tenants, 1);
    assert.equal(r.updated, 2);
    assert.equal(Number((await prisma.appointment.findUniqueOrThrow({ where: { id: riskyAptId } })).noShowRiskScore), 66);
    assert.equal(Number((await prisma.appointment.findUniqueOrThrow({ where: { id: reliableAptId } })).noShowRiskScore), 5);
    assert.equal((await on.runNightly()).updated, 0, "unchanged scores are not rewritten");
  });
});
