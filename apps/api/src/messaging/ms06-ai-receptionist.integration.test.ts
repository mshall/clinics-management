import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UserRole } from "@prisma/client";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { SlotService } from "../scheduling/slot.service";
import type { MessagingService } from "./messaging.service";
import { WhatsAppAiReceptionistService } from "./whatsapp-ai-receptionist.service";

const prisma = new PrismaClient();

describe("MS-06 AI receptionist integration", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  const queued: { body: string }[] = [];
  let svc: WhatsAppAiReceptionistService;

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    const tenant = await prisma.tenant.create({
      data: { name: `MS06 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: `MS06 Clinic ${stamp}`,
        nameAr: "عيادة",
        country: base.country,
        city: base.city,
        addressEn: "Street 1",
        addressAr: "شارع ١",
        locationUrl: "https://maps.example/ms06",
        timezone: base.timezone,
        phone: base.phone,
        email: `ms06.${stamp}@example.com`,
        licenseNumber: `MS06-${stamp}`,
        defaultCurrency: base.defaultCurrency,
        openingTime: "09:00",
        closingTime: "21:00",
      },
    });
    clinicId = clinic.id;
    await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MS06-${stamp}`,
        firstNameEn: "Ali",
        lastNameEn: "Patient",
        gender: "M",
        phone: "+201055506106",
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        email: `ms06.doc.${stamp}@example.com`,
        passwordHash: "x",
        displayName: "Dr MS06",
        role: UserRole.PHYSICIAN,
      },
    });
    await prisma.appointmentType.create({
      data: {
        tenantId,
        clinicId,
        nameEn: "Consult",
        nameAr: "كشف",
        feeAmount: 300,
        durationMinutes: 20,
      },
    });

    svc = new WhatsAppAiReceptionistService(
      prisma as unknown as PrismaService,
      {
        getSlots: async () => ({
          clinicId,
          clinicianId: "x",
          typeId: "y",
          from: "",
          to: "",
          channel: "INTERNAL",
          slots: [
            { startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000 + 1_200_000).toISOString(), roomLabel: null },
          ],
        }),
      } as unknown as SlotService,
      {
        queueMessage: async (_t: string, body: { body: string }) => {
          queued.push(body);
          return {};
        },
      } as unknown as MessagingService,
      { isEnabled: async () => true } as unknown as FeatureFlagsService,
    );
  });

  after(async () => {
    await prisma.whatsAppReceptionistTurn.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.outboundMessage.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("clinical inbound hands over and never invents medical advice", async () => {
    queued.length = 0;
    const res = await svc.handleInboundText({
      fromPhone: "+201055506106",
      text: "عندي ألم في البطن ايه العلاج؟",
      providerMessageId: `ms06-clinical-${stamp}`,
      tenantId,
    });
    assert.ok(res);
    assert.equal(res!.intent, "CLINICAL");
    assert.equal(res!.handedOver, true);
    assert.match(res!.replyText, /مش هقدر أدي نصيحة طبية/);
    assert.equal(queued.length, 1);
    const turn = await prisma.whatsAppReceptionistTurn.findFirst({
      where: { tenantId, intent: "CLINICAL" },
    });
    assert.ok(turn?.handedOver);
  });

  it("booking intent returns slot suggestions in Egyptian Arabic", async () => {
    queued.length = 0;
    const res = await svc.handleInboundText({
      fromPhone: "+201055506106",
      text: "عايز أحجز موعد",
      providerMessageId: `ms06-book-${stamp}`,
      tenantId,
    });
    assert.ok(res);
    assert.equal(res!.intent, "BOOKING");
    assert.equal(res!.handedOver, false);
    assert.match(res!.replyText, /أقرب مواعيد|الحجز/);
  });
});
