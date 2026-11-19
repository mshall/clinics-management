import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  AppointmentWaitlistStatus,
  Prisma,
  PrismaClient,
  UserRole,
  WaitlistOfferStatus,
  WaitlistOpenSlotStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import type { UsageMeterService } from "../usage/usage-meter.service";
import { AppointmentOutboxService } from "./appointment-outbox.service";
import { MessagingService } from "./messaging.service";
import { OutboxEventService } from "./outbox-event.service";
import { WaitlistAutofillService } from "./waitlist-autofill.service";
import { WAITLIST_OFFER_TEMPLATE_KEY } from "./whatsapp-reply-payloads";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

function services() {
  const audit = new AuditService(prismaSvc);
  const consent = new MessagingConsentService(prismaSvc, audit, new ConsentPolicyService(prismaSvc, audit));
  const usage = { assertWhatsAppQuota: async () => undefined } as unknown as UsageMeterService;
  const messaging = new MessagingService(prismaSvc, consent, usage);
  const autofill = new WaitlistAutofillService(
    prismaSvc,
    messaging,
    { isEnabled: async () => true } as never,
    audit,
    new AppointmentOutboxService(new OutboxEventService(prismaSvc)),
    { invalidateAndNotify: async () => undefined } as never,
  );
  const scheduling = new SchedulingService(prismaSvc, {} as never, { invalidateAndNotify: async () => undefined } as never);
  return { autofill, scheduling };
}

/** The provider message id the patient's button reply will reference (set by the send worker in real life). */
async function providerIdForOffer(offerId: string): Promise<string> {
  const offer = await prisma.waitlistSlotOffer.findUniqueOrThrow({ where: { id: offerId } });
  assert.ok(offer.outboundMessageId, "offer has a queued WhatsApp message");
  await prisma.outboundMessage.updateMany({
    where: { id: offer.outboundMessageId!, providerMessageId: null },
    data: { providerMessageId: `wamid.fs03.${offerId}` },
  });
  const row = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: offer.outboundMessageId! } });
  return row.providerMessageId!;
}

describe("FS-03 waitlist auto-fill on cancellations", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let clinicianId: string;
  const patientIds: string[] = [];
  const entryIds: string[] = [];
  let sourceAptId: string;
  let slotId: string;
  let slotStartsAt: Date;

  const pendingForSlot = () =>
    prisma.waitlistSlotOffer.count({ where: { slotId, status: WaitlistOfferStatus.PENDING } });

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    // scratch tenant with WhatsApp reminders off: a live dev-server auto-fill loop on the same DB leaves it alone,
    // while the service under test gets an always-on flag stub
    const tenant = await prisma.tenant.create({
      data: {
        name: `FS03 ${stamp}`,
        deploymentCell: base.tenant.deploymentCell,
        marketId: base.tenant.marketId,
        whatsAppRemindersEnabled: false,
        tenantFeatureFlags: { create: { key: "whatsapp_reminders", enabled: false } },
      },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: `FS03 Branch ${stamp}`,
        nameAr: "فرع قائمة الانتظار",
        country: base.country,
        city: base.city,
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/fs03",
        timezone: base.timezone,
        phone: base.phone,
        email: `fs03.${stamp}@example.com`,
        licenseNumber: `FS03-${stamp}`,
        defaultCurrency: base.defaultCurrency,
      },
    });
    clinicId = clinic.id;
    const doc = await prisma.user.create({
      data: {
        tenantId,
        email: `fs03.dr.${stamp}@example.com`,
        passwordHash: "x",
        displayName: "Dr FS03",
        role: UserRole.PHYSICIAN,
      },
    });
    clinicianId = doc.id;
    // a quiet hour 9 days out so no seeded booking clashes
    slotStartsAt = new Date(Date.now() + 9 * 86_400_000);
    slotStartsAt.setUTCHours(3, 7, 0, 0);

    for (const [i, name] of ["Amal", "Basma", "Camelia"].entries()) {
      const p = await prisma.patient.create({
        data: {
          tenantId,
          mrn: `FS03-${stamp}-${i}`,
          firstNameEn: name,
          lastNameEn: "Waitlist",
          gender: "UNKNOWN",
          phone: `+2010555${String(stamp).slice(-4)}${i}`,
        },
      });
      patientIds.push(p.id);
      const e = await prisma.appointmentWaitlistEntry.create({
        data: { tenantId, clinicId, patientId: p.id, clinicianId, createdAt: new Date(Date.now() - (10 - i) * 60_000) },
      });
      entryIds.push(e.id);
    }
    const owner = await prisma.patient.create({
      data: { tenantId, mrn: `FS03-${stamp}-src`, firstNameEn: "Src", lastNameEn: "Owner", gender: "UNKNOWN", phone: "+201055500999" },
    });
    patientIds.push(owner.id);
    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        clinicianId,
        patientId: owner.id,
        startsAt: slotStartsAt,
        endsAt: new Date(slotStartsAt.getTime() + 30 * 60_000),
        feeAmount: new Prisma.Decimal("350"),
        status: AppointmentStatus.CANCELLED,
      },
    });
    sourceAptId = apt.id;
  });

  after(async () => {
    await prisma.waitlistOpenSlot.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointmentWaitlistEntry.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.outboundMessage.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("a cancellation opens exactly one slot for that clinician and time", async () => {
    const { scheduling } = services();
    const first = await scheduling.recordFreedSlot(tenantId, sourceAptId);
    const again = await scheduling.recordFreedSlot(tenantId, sourceAptId);
    assert.ok(first);
    assert.equal(again, null, "second cancellation event for the same time does not open a duplicate slot");
    slotId = first!.slotId;
  });

  it("never offers the same slot to two people at once (concurrent workers + DB constraint)", async () => {
    const { autofill } = services();
    await Promise.all([
      autofill.offerNext(slotId),
      autofill.offerNext(slotId),
      services().autofill.offerNext(slotId),
      autofill.processTenant(tenantId),
    ]);
    assert.equal(await pendingForSlot(), 1);
    const offer = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId, status: WaitlistOfferStatus.PENDING } });
    assert.equal(offer.patientId, patientIds[0], "oldest waitlist entry first");
    const msg = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: offer.outboundMessageId! } });
    assert.equal(msg.templateKey, WAITLIST_OFFER_TEMPLATE_KEY);
    assert.ok(offer.expiresAt.getTime() - offer.offeredAt.getTime() === 15 * 60_000, "15 minute hold");

    await assert.rejects(
      () =>
        prisma.waitlistSlotOffer.create({
          data: {
            tenantId,
            slotId,
            waitlistEntryId: entryIds[1]!,
            patientId: patientIds[1]!,
            activeSlotId: slotId,
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
      "database refuses a second live offer for the slot",
    );
  });

  it("decline passes the slot to the next person in line", async () => {
    const { autofill } = services();
    const offer = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId, status: WaitlistOfferStatus.PENDING } });
    const res = await autofill.handleReply(await providerIdForOffer(offer.id), "waitlist_decline");
    assert.equal(res.outcome, "DECLINED");
    const first = await prisma.appointmentWaitlistEntry.findUniqueOrThrow({ where: { id: entryIds[0]! } });
    assert.equal(first.status, AppointmentWaitlistStatus.WAITING, "decliner stays on the waitlist for other slots");
    const next = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId, status: WaitlistOfferStatus.PENDING } });
    assert.equal(next.patientId, patientIds[1]);
    assert.equal(await pendingForSlot(), 1);
  });

  it("an unanswered offer expires after the hold and moves on; a late Accept does not book", async () => {
    const { autofill } = services();
    const stale = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId, status: WaitlistOfferStatus.PENDING } });
    const later = new Date(stale.expiresAt.getTime() + 1_000);
    await autofill.processTenant(tenantId, later);
    const expired = await prisma.waitlistSlotOffer.findUniqueOrThrow({ where: { id: stale.id } });
    assert.equal(expired.status, WaitlistOfferStatus.EXPIRED);
    const next = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId, status: WaitlistOfferStatus.PENDING } });
    assert.equal(next.patientId, patientIds[2]);
    assert.equal(await pendingForSlot(), 1);

    const late = await autofill.handleReply(await providerIdForOffer(stale.id), "waitlist_accept");
    assert.equal(late.outcome, "UNAVAILABLE");
    assert.equal(await prisma.appointment.count({ where: { patientId: patientIds[1]!, startsAt: slotStartsAt } }), 0);
  });

  it("first to accept gets the slot; a second accept never double-books", async () => {
    const { autofill } = services();
    const offer = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId, status: WaitlistOfferStatus.PENDING } });
    const providerId = await providerIdForOffer(offer.id);
    const [a, b] = await Promise.all([
      autofill.handleReply(providerId, "waitlist_accept"),
      autofill.handleReply(providerId, "waitlist_accept"),
    ]);
    assert.deepEqual([a.outcome, b.outcome].sort(), ["BOOKED", "UNAVAILABLE"]);
    const booked = await prisma.appointment.findMany({
      where: { tenantId, clinicianId, startsAt: slotStartsAt, status: { not: AppointmentStatus.CANCELLED } },
    });
    assert.equal(booked.length, 1);
    assert.equal(booked[0]!.patientId, patientIds[2]);
    assert.equal(booked[0]!.status, AppointmentStatus.CONFIRMED);
    assert.equal(String(booked[0]!.feeAmount), "350");
    const slot = await prisma.waitlistOpenSlot.findUniqueOrThrow({ where: { id: slotId } });
    assert.equal(slot.status, WaitlistOpenSlotStatus.FILLED);
    assert.equal(slot.openKey, null);
    const entry = await prisma.appointmentWaitlistEntry.findUniqueOrThrow({ where: { id: entryIds[2]! } });
    assert.equal(entry.status, AppointmentWaitlistStatus.BOOKED);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId, action: "WAITLIST_SLOT_BOOKED", resourceId: booked[0]!.id } }));
    assert.equal(await pendingForSlot(), 0);
  });

  it("if the front desk fills the time first, the slot is withdrawn instead of offered", async () => {
    const { autofill, scheduling } = services();
    const t = new Date(slotStartsAt.getTime() + 2 * 3600_000);
    const src = await prisma.appointment.create({
      data: { tenantId, clinicId, clinicianId, patientId: patientIds[3]!, startsAt: t, endsAt: new Date(t.getTime() + 1_800_000), status: AppointmentStatus.CANCELLED },
    });
    const freed = await scheduling.recordFreedSlot(tenantId, src.id);
    assert.ok(freed);
    await prisma.appointment.create({
      data: { tenantId, clinicId, clinicianId, patientId: patientIds[3]!, startsAt: t, endsAt: new Date(t.getTime() + 1_800_000) },
    });
    await autofill.offerNext(freed!.slotId);
    const slot = await prisma.waitlistOpenSlot.findUniqueOrThrow({ where: { id: freed!.slotId } });
    assert.equal(slot.status, WaitlistOpenSlotStatus.FILLED_ELSEWHERE);
    assert.equal(await prisma.waitlistSlotOffer.count({ where: { slotId: freed!.slotId } }), 0);
    await prisma.waitlistOpenSlot.delete({ where: { id: freed!.slotId } });
  });

  it("staff can add to and remove from the waitlist; removing withdraws a live offer", async () => {
    const { autofill, scheduling } = services();
    await assert.rejects(() => scheduling.createWaitlist(tenantId, { clinicId, patientId: "not-a-patient" }), /Unknown/);
    const entry = await scheduling.createWaitlist(tenantId, { clinicId, patientId: patientIds[0]!, clinicianId });
    entryIds.push(entry.id);
    const t = new Date(slotStartsAt.getTime() + 4 * 3600_000);
    const src = await prisma.appointment.create({
      data: { tenantId, clinicId, clinicianId, patientId: patientIds[3]!, startsAt: t, endsAt: new Date(t.getTime() + 1_800_000), status: AppointmentStatus.CANCELLED },
    });
    const freed = await scheduling.recordFreedSlot(tenantId, src.id);
    await autofill.offerNext(freed!.slotId);
    const offer = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId: freed!.slotId, status: WaitlistOfferStatus.PENDING } });
    await scheduling.cancelWaitlistEntry(tenantId, offer.waitlistEntryId);
    const withdrawn = await prisma.waitlistSlotOffer.findUniqueOrThrow({ where: { id: offer.id } });
    assert.equal(withdrawn.status, WaitlistOfferStatus.WITHDRAWN);
    assert.equal(withdrawn.activeSlotId, null);
    const listed = await scheduling.listWaitlistOffers(tenantId, clinicId);
    assert.ok(listed.some((s) => s.id === freed!.slotId && s.offers.some((o) => o.status === WaitlistOfferStatus.WITHDRAWN)));
    await prisma.waitlistSlotOffer.deleteMany({ where: { slotId: freed!.slotId } });
    await prisma.waitlistOpenSlot.delete({ where: { id: freed!.slotId } });
  });
});
