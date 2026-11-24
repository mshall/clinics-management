import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentWaitlistStatus, ListingStatus, WaitlistOpenSlotStatus } from "@prisma/client";
import { ensureKiorexDevIntegration, KX_DEV_CLIENT_KEY, KX_DEV_TENANT_NAME } from "../../prisma/kiorex-dev.seed";
import { AuditService } from "../audit/audit.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { WaitlistAutofillService } from "../messaging/waitlist-autofill.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { MarketplaceWaitlistService } from "./marketplace-waitlist.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

/** GRW-GC-2 G-8: WAITLIST_OFFER_CREATED beside WAITLIST_OFFER, WAITLIST_OFFER_EXPIRED when an offer lapses; payloads match the 1.12.0 schemas. */
describe("GRW-GC-2 waitlist offer events (real Postgres)", () => {
  let tenantId: string;
  let clinicId: string;
  let clinicianId: string;
  let client: PlatformIntegrationPrincipal;
  const stamp = Date.now();

  before(async () => {
    await prisma.$connect();
    await ensureKiorexDevIntegration(prisma);
    tenantId = (await prisma.tenant.findFirstOrThrow({ where: { name: KX_DEV_TENANT_NAME } })).id;
    const l = await prisma.marketplaceListing.findFirstOrThrow({ where: { tenantId, status: ListingStatus.LIVE } });
    clinicId = l.clinicId;
    clinicianId = l.clinicianId;
    const c = await prisma.platformIntegrationClient.findUniqueOrThrow({ where: { clientKey: KX_DEV_CLIENT_KEY } });
    client = { id: c.id, clientKey: c.clientKey, name: c.name, scopes: c.scopes } as unknown as PlatformIntegrationPrincipal;
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("emits CREATED with the offer, and EXPIRED (reason EXPIRED) when the hold lapses; a second pass is a no-op", async () => {
    const audit = new AuditService(prismaSvc);
    const outbox = new OutboxEventService(prismaSvc);
    const autofill = new WaitlistAutofillService(prismaSvc, { queueMessage: async () => assert.fail("no WhatsApp for Kiorex entries") } as never, { isEnabled: async () => true } as never, audit, new AppointmentOutboxService(outbox), { invalidateAndNotify: async () => undefined } as never, outbox);
    const svc = new MarketplaceWaitlistService(prismaSvc, new MarketplaceAccessService(prismaSvc), new MarketplacePatientIntakeService(prismaSvc), new ConsentPolicyService(prismaSvc, audit), audit, autofill);
    const ref = `gc2_wl_${stamp}`;
    await svc.join(client, { externalRef: ref, clinicId, clinicianId, patient: { phone: "+201055500777", firstNameEn: "Hana", lastNameEn: "Gamal" } } as never);
    const entry = await prisma.appointmentWaitlistEntry.findUniqueOrThrow({ where: { externalRef: ref } });
    await prisma.appointmentWaitlistEntry.updateMany({ where: { tenantId, clinicId, status: AppointmentWaitlistStatus.WAITING, id: { not: entry.id } }, data: { status: AppointmentWaitlistStatus.CANCELLED } });
    await prisma.waitlistOpenSlot.updateMany({ where: { tenantId, status: WaitlistOpenSlotStatus.OPEN }, data: { status: WaitlistOpenSlotStatus.CLOSED, closedAt: new Date() } });
    const startsAt = new Date(Date.now() + 6 * 86_400_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const type = await prisma.appointmentType.findFirstOrThrow({ where: { clinicId, marketplaceBookable: true } });
    const slot = await prisma.waitlistOpenSlot.create({ data: { tenantId, clinicId, clinicianId, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), appointmentTypeId: type.id, openKey: `gc2-${stamp}` } });

    await autofill.offerNext(slot.id);
    const offer = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId: slot.id, waitlistEntryId: entry.id } });
    const created = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "WAITLIST_OFFER_CREATED", aggregateId: offer.id } });
    const legacy = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "WAITLIST_OFFER", aggregateId: offer.id } });
    const c = created.payload as Record<string, unknown>;
    for (const f of ["offerId", "waitlistRef", "clinicId", "clinicianId", "startsAt", "expiresAt"]) assert.ok(c[f], f);
    assert.equal(c.waitlistRef, ref);
    assert.equal(c.offerId, (legacy.payload as Record<string, unknown>).offerId, "same offer in both events");
    assert.equal(created.target, "KIOREX");
    assert.ok(!JSON.stringify(c).match(/phone|patient|Hana/i), "no patient data in the event");

    await prisma.waitlistSlotOffer.update({ where: { id: offer.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await autofill.processTenant(tenantId);
    const expired = await prisma.outboxEvent.findMany({ where: { type: "WAITLIST_OFFER_EXPIRED", aggregateId: offer.id } });
    assert.equal(expired.length, 1);
    const e = expired[0]!.payload as Record<string, unknown>;
    assert.equal(e.reason, "EXPIRED");
    assert.equal(e.waitlistRef, ref);
    assert.equal(e.clinicId, clinicId);
    assert.ok(e.at);
    await autofill.processTenant(tenantId);
    assert.equal((await prisma.outboxEvent.findMany({ where: { type: "WAITLIST_OFFER_EXPIRED", aggregateId: offer.id } })).length, 1, "no duplicate event");
    await prisma.waitlistOpenSlot.updateMany({ where: { id: slot.id }, data: { status: WaitlistOpenSlotStatus.CLOSED, closedAt: new Date() } });
  });
});
