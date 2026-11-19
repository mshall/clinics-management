import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import { INSTALLMENT_REMINDER_TEMPLATE_KEY, InstallmentRemindersService } from "./installment-reminders.service";
import type { MessagingService } from "./messaging.service";

const prisma = new PrismaClient();
const svc = prisma as unknown as PrismaService;

describe("MN-06 installment WhatsApp reminders", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let operationId: string;
  let installmentId: string;
  let desk: JwtUser;
  const sent: { templateKey?: string; toPhone?: string; variables?: Record<string, string> }[] = [];
  let whatsappOn = true;

  const reminders = () =>
    new InstallmentRemindersService(
      svc,
      {
        queueMessage: async (_t: string, body: (typeof sent)[number]) => {
          sent.push(body);
          return { id: `msg-${sent.length}` };
        },
      } as unknown as MessagingService,
      { isEnabled: async () => whatsappOn } as unknown as FeatureFlagsService,
    );

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `MN06R ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `MN06R Clinic ${stamp}`,
          nameAr: "عيادة",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/mn06r",
          timezone: base.timezone,
          phone: base.phone,
          email: `mn06r.${stamp}@example.com`,
          licenseNumber: `MN06R-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const d = await prisma.user.create({
      data: { tenantId, email: `mn06r.desk.${stamp}@example.com`, passwordHash: "x", displayName: "Desk", role: UserRole.RECEPTIONIST },
    });
    desk = { userId: d.id, tenantId, email: d.email, role: UserRole.RECEPTIONIST, additionalRoles: [] } as unknown as JwtUser;
    const doctorId = (
      await prisma.user.create({ data: { tenantId, email: `mn06r.dr.${stamp}@example.com`, passwordHash: "x", displayName: "Dr", role: UserRole.PHYSICIAN } })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { tenantId, mrn: `MN06R-${stamp}`, firstNameEn: "Install", lastNameEn: "Ment", gender: "UNKNOWN", phone: "+201055506006" },
      })
    ).id;
    const op = await prisma.operation.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: doctorId,
        operationDate: new Date(),
        totalCost: new Prisma.Decimal("2000"),
        feeCurrency: "EGP",
      },
    });
    operationId = op.id;
    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 1);
    installmentId = (
      await prisma.operationInstallment.create({
        data: { tenantId, operationId, dueOn: due, amount: new Prisma.Decimal("1000") },
      })
    ).id;
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("queues installment_due_reminder once for due-soon unpaid rows; skips when WhatsApp is off", async () => {
    sent.length = 0;
    whatsappOn = true;
    const first = await reminders().sendDue(new Date(), { tenantId });
    assert.equal(first.sent, 1);
    assert.equal(sent[0]?.templateKey, INSTALLMENT_REMINDER_TEMPLATE_KEY);
    assert.equal(sent[0]?.toPhone, "+201055506006");
    const row = await prisma.operationInstallment.findUniqueOrThrow({ where: { id: installmentId } });
    assert.ok(row.reminderSentAt);

    const again = await reminders().sendDue(new Date(), { tenantId });
    assert.equal(again.sent, 0, "already reminded");

    whatsappOn = false;
    const far = await prisma.operationInstallment.create({
      data: {
        tenantId,
        operationId,
        dueOn: new Date(Date.now() + 2 * 86_400_000),
        amount: new Prisma.Decimal("500"),
      },
    });
    const off = await reminders().sendDue(new Date(), { tenantId });
    assert.equal(off.sent, 0);
    await prisma.operationInstallment.delete({ where: { id: far.id } });
  });

  it("desk can resend a reminder for an unpaid installment", async () => {
    sent.length = 0;
    whatsappOn = true;
    await prisma.operationInstallment.update({ where: { id: installmentId }, data: { reminderSentAt: null } });
    const r = await reminders().sendManual(tenantId, desk, installmentId);
    assert.ok(r.messageId);
    assert.equal(sent[0]?.templateKey, INSTALLMENT_REMINDER_TEMPLATE_KEY);
  });
});
