import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BookingSource, MessageChannel, PrismaClient, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { upsertEncounterVisitFeeRevenue } from "../common/visit-fee-ledger";
import { postRevenue, SAMPLE_PATIENT_NO_REVENUE } from "../compliance/post-revenue";
import type { ConsentPolicyService } from "../compliance/consent-policy.service";
import type { CreditWalletService } from "../credits/credit-wallet.service";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import type { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import type { OutboxEventService } from "../messaging/outbox-event.service";
import { MESSAGING_CONSENT_TRANSACTIONAL } from "../patients/messaging-consent.constants";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SampleDataService } from "./sample-data.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const ps = prisma as unknown as PrismaService;
const sampleData = new SampleDataService(ps, new AuditService(ps));

describe("ON-08 sample data", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let owner: JwtUser;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Sample ${suffix}`,
        nameAr: "عيادة تجريبية",
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
            locationUrl: "https://maps.example/s",
            phone: "201000000008",
            email: `on08.${suffix}@example.com`,
            licenseNumber: "L-8",
            defaultCurrency: "EGP",
          },
        },
      },
      include: { clinics: true },
    });
    tenantId = tenant.id;
    clinicId = tenant.clinics[0]!.id;
    const u = await prisma.user.create({
      data: {
        tenantId,
        email: `on08.owner.${suffix}@example.com`,
        displayName: "Dr Sample",
        role: UserRole.PHYSICIAN,
        isTenantOwner: true,
        passwordHash: "x",
      },
    });
    owner = { userId: u.id, tenantId, email: u.email, role: UserRole.PHYSICIAN, isTenantOwner: true };
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("creates one clearly marked sample patient + appointment (idempotent)", async () => {
    const a = await sampleData.create(tenantId, owner);
    assert.equal(a.created, true);
    const b = await sampleData.create(tenantId, owner);
    assert.equal(b.created, false);
    assert.equal(b.patientId, a.patientId);
    const p = await prisma.patient.findUniqueOrThrow({ where: { id: a.patientId } });
    assert.equal(p.isSample, true);
    assert.equal(p.phone, "");
    assert.ok(a.appointmentId);
  });

  it("AC: sample data never generates revenue", async () => {
    const s = (await sampleData.get(tenantId))!;
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          postRevenue(tx, {
            tenantId,
            clinicId,
            category: "VISIT_FEE",
            grossAmount: 300,
            taxAmount: 0,
            netAmount: 300,
            currency: "EGP",
            appointmentId: s.appointmentId,
          }),
        ),
      (e: unknown) => JSON.stringify((e as { getResponse?: () => unknown }).getResponse?.()).includes(SAMPLE_PATIENT_NO_REVENUE),
    );
    const encounter = await prisma.encounter.create({
      data: { tenantId, clinicId, patientId: s.patientId, clinicianId: owner.userId, appointmentId: s.appointmentId, visitType: "CONSULTATION" },
    });
    await prisma.$transaction((tx) =>
      upsertEncounterVisitFeeRevenue(tx, {
        tenantId,
        clinicId,
        encounterId: encounter.id,
        appointmentId: s.appointmentId,
        amount: 300,
        currency: "EGP",
        patientId: s.patientId,
      }),
    );
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId } }), 0);
  });

  it("AC: sample data never generates Kiorex commissions", async () => {
    const s = (await sampleData.get(tenantId))!;
    await prisma.appointment.update({
      where: { id: s.appointmentId! },
      data: { bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, feeAmount: 500 },
    });
    const charges = new CommissionChargeService(
      ps,
      {} as KiorexCommissionService,
      {} as OutboxEventService,
      {} as CreditWalletService,
    );
    await prisma.$transaction((tx) => charges.onCheckIn(tx, tenantId, s.appointmentId!, new Date()));
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { tenantId } }), 0);
  });

  it("AC: sample data never generates WhatsApp messages", async () => {
    const s = (await sampleData.get(tenantId))!;
    const consent = new MessagingConsentService(ps, new AuditService(ps), {} as ConsentPolicyService);
    assert.equal(await consent.isGranted(tenantId, s.patientId, MessageChannel.WHATSAPP, MESSAGING_CONSENT_TRANSACTIONAL), false);
    await assert.rejects(
      () => consent.assertCanSend(tenantId, s.patientId, MessageChannel.WHATSAPP, "appointment_confirm"),
      (e: unknown) => JSON.stringify((e as { getResponse?: () => unknown }).getResponse?.()).includes("SAMPLE_PATIENT_NO_MESSAGES"),
    );
  });

  it("is removed by DELETE", async () => {
    assert.equal(await prisma.appointment.count({ where: { tenantId } }), 1);
    const removed = await sampleData.remove(tenantId, owner);
    assert.equal(removed.removed, 1);
    assert.equal(await sampleData.get(tenantId), null);
    assert.equal(await prisma.appointment.count({ where: { tenantId } }), 0);
    const audits = await prisma.auditLog.findMany({ where: { tenantId, action: { startsWith: "SAMPLE_DATA_" } } });
    assert.deepEqual(audits.map((a) => a.action).sort(), ["SAMPLE_DATA_CREATED", "SAMPLE_DATA_REMOVED"]);
  });
});
