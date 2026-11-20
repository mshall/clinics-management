import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { CashierShiftService } from "../billing/cashier-shift.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import { InternalOutboxConsumerService } from "./internal-outbox-consumer.service";
import type { MessagingService } from "./messaging.service";
import { OwnerNotificationsService } from "./owner-notifications.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;

describe("MN-03 owner WhatsApp shift summary (INTERNAL outbox consumer)", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let desk: JwtUser;
  const sent: { toPhone: string; templateKey?: string; variables?: Record<string, string> }[] = [];
  let whatsappOn = true;

  const consumer = () =>
    new InternalOutboxConsumerService(
      svc,
      new OwnerNotificationsService(
        svc,
        {
          queueMessage: async (_t: string, body: (typeof sent)[number]) => {
            sent.push(body);
            return {};
          },
        } as unknown as MessagingService,
        { isEnabled: async () => whatsappOn } as unknown as FeatureFlagsService,
      ),
    );

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `MN03S ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `MN03S Branch ${stamp}`,
          nameAr: "فرع",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/mn03s",
          timezone: base.timezone,
          phone: base.phone,
          email: `mn03s.${stamp}@example.com`,
          licenseNumber: `MN03S-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const mkOwner = async (tag: string, phone: string | null) => {
      const u = await prisma.user.create({
        data: { tenantId, email: `mn03s.${tag}.${stamp}@example.com`, passwordHash: "x", displayName: tag, role: UserRole.GROUP_ADMIN, isTenantOwner: true },
      });
      if (phone) {
        await prisma.employee.create({
          data: {
            tenantId,
            clinicId,
            userId: u.id,
            firstNameEn: tag,
            lastNameEn: "Owner",
            email: u.email,
            phone,
            employeeNumber: `MN03S-${tag}-${stamp}`,
            jobTitle: "Owner",
            employmentType: "FULL_TIME",
            hireDate: new Date(),
            salaryBase: new Prisma.Decimal("0"),
          },
        });
      }
    };
    await mkOwner("withphone", "+201055504001");
    await mkOwner("nophone", null);
    const d = await prisma.user.create({
      data: { tenantId, email: `mn03s.desk.${stamp}@example.com`, passwordHash: "x", displayName: "Desk", role: UserRole.RECEPTIONIST },
    });
    desk = { userId: d.id, tenantId, email: d.email, role: UserRole.RECEPTIONIST, additionalRoles: [] } as unknown as JwtUser;
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("each closed shift sends every owner with a phone one summary, once", async () => {
    const shifts = new CashierShiftService(svc);
    const a = await shifts.open(tenantId, desk, { clinicId, openingFloat: 200 });
    await shifts.close(tenantId, desk, a.id, { countedCash: 200 });
    const b = await shifts.open(tenantId, desk, { clinicId, openingFloat: 200 });
    await shifts.close(tenantId, desk, b.id, { countedCash: 0, note: "missing" });

    const r = await consumer().processBatch(50, { tenantId });
    assert.equal(r.sent, 2);
    assert.equal(sent.length, 2, "owner without a phone is skipped");
    assert.ok(sent.every((m) => m.toPhone === "+201055504001" && m.templateKey === "owner_shift_summary"));
    assert.deepEqual(
      sent.map((m) => m.variables?.status),
      ["OK", "REVIEW"],
    );
    const rows = await prisma.outboxEvent.findMany({ where: { tenantId } });
    assert.ok(rows.every((e) => e.status === "SENT" && e.sentAt));
    assert.equal((await consumer().processBatch(50, { tenantId })).processed, 0, "not delivered twice");
  });

  it("WhatsApp disabled for the tenant: event is consumed, nothing queued", async () => {
    whatsappOn = false;
    sent.length = 0;
    const shifts = new CashierShiftService(svc);
    const c = await shifts.open(tenantId, desk, { clinicId, openingFloat: 0 });
    await shifts.close(tenantId, desk, c.id, { countedCash: 0 });
    // Prefer claiming any still-pending row; a live Nest worker may already have marked it SENT.
    const pending = await prisma.outboxEvent.count({
      where: { tenantId, type: "billing.shift_closed", status: "PENDING" },
    });
    if (pending > 0) {
      const r = await consumer().processBatch(50, { tenantId });
      assert.equal(r.sent, 1);
    } else {
      const rows = await prisma.outboxEvent.findMany({ where: { tenantId, type: "billing.shift_closed" } });
      assert.ok(rows.some((e) => e.status === "SENT"), "shift_closed was consumed");
    }
    assert.equal(sent.length, 0, "disabled WhatsApp must not queue owner summaries");
  });
});
