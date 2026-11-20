import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, ListingStatus, PrismaClient, WaitlistOpenSlotStatus } from "@prisma/client";
import { ensureKiorexDevIntegration, KX_DEV_CLIENT_KEY, KX_DEV_TENANT_NAME } from "../../prisma/kiorex-dev.seed";
import { AuditService } from "../audit/audit.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { FeatureDisabledException } from "../feature-flags/feature-disabled.exception";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { diffSnapshots, type FlagSnapshot } from "../feature-flags/kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "../feature-flags/kiorex-flag-snapshot.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { WaitlistAutofillService } from "../messaging/waitlist-autofill.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { MarketplaceWaitlistService } from "./marketplace-waitlist.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { RecordShareService } from "./record-share.service";
import { SlotCapacityService } from "./slot-capacity.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

function snapshot(version: number, flags: FlagSnapshot["flags"]): FlagSnapshot {
  return { product: "kiorly-clinic", version, generatedAt: new Date().toISOString(), flags, signature: "x" };
}
const flag = (key: string, extra: Partial<FlagSnapshot["flags"][number]> = {}): FlagSnapshot["flags"][number] => ({
  key,
  class: "Module",
  scopes: ["global", "market", "org"],
  dependsOn: [],
  launchLocked: false,
  gateSatisfied: true,
  values: {},
  ...extra,
});

describe("KXW marketplace extras: slot-capacity, waitlist, flag-driven listing status", () => {
  let tenantId: string;
  let clinicId: string;
  let clinicianId: string;
  let client: PlatformIntegrationPrincipal;
  const stamp = Date.now();

  before(async () => {
    await prisma.$connect();
    await ensureKiorexDevIntegration(prisma);
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: KX_DEV_TENANT_NAME } });
    tenantId = tenant.id;
    const l = await prisma.marketplaceListing.findFirstOrThrow({ where: { tenantId, status: ListingStatus.LIVE } });
    clinicId = l.clinicId;
    clinicianId = l.clinicianId;
    const c = await prisma.platformIntegrationClient.findUniqueOrThrow({ where: { clientKey: KX_DEV_CLIENT_KEY } });
    client = { id: c.id, clientKey: c.clientKey, name: c.name, scopes: c.scopes } as unknown as PlatformIntegrationPrincipal;
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("slot-capacity returns per-day open slot counts equal to the live slot engine, plus totals", async () => {
    const slots = new SlotService(prismaSvc, new OutboxEventService(prismaSvc));
    const svc = new SlotCapacityService(prismaSvc, slots);
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const out = await svc.capacity({ from: day, to: day, clinicId, clinicianId });
    assert.equal(out.items.length, 1);
    const item = out.items[0]!;
    assert.equal(item.date, day);
    assert.ok(item.openSlots >= 0 && item.slotMinutes > 0);
    const tz = (await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } })).timezone ?? "Africa/Cairo";
    const dayStart = new Date(`${day}T00:00:00Z`);
    const expected = await slots.getSlots({
      tenantId,
      clinicId,
      clinicianId,
      typeId: item.typeId,
      from: new Date(dayStart.getTime() - 14 * 3_600_000),
      to: new Date(dayStart.getTime() + 38 * 3_600_000),
      channel: SLOT_CHANNEL.MARKETPLACE,
    });
    const local = expected.slots.filter(
      (s) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(s.startsAt)) === day,
    );
    assert.equal(item.openSlots, local.length);
    assert.equal(out.totals.length, 1);
    assert.equal(out.totals[0]!.openSlots, item.openSlots);
    assert.deepEqual(Object.keys(item).sort(), ["clinicId", "clinicianId", "date", "openSlots", "slotMinutes", "typeId"]);

    await assert.rejects(() => svc.capacity({ from: "nope", to: day }));
    await assert.rejects(() => svc.capacity({ from: "2027-01-01", to: "2027-03-01" }));
  });

  it("clinic.kiorex_listing OFF in a snapshot pauses the listing immediately; ON restores it", async () => {
    const audit = { recordEvent: async () => undefined } as unknown as AuditService;
    const snaps = new KiorexFlagSnapshotService(prismaSvc, audit);
    const flags = new FeatureFlagsService(prismaSvc, { resolve: async () => ({ entitlements: {} }) } as never, snaps);
    const listings = new MarketplaceListingService(prismaSvc, new OutboxEventService(prismaSvc), flags, snaps);
    listings.onModuleInit();

    const off = snapshot(11, [flag("clinic.kiorex_listing", { values: { global: "OFF" } })]);
    snaps.setSnapshotForTests(off);
    await snaps.notifyChanged(diffSnapshots(null, off));
    const paused = await prisma.marketplaceListing.findFirstOrThrow({ where: { clinicId, clinicianId } });
    assert.equal(paused.status, ListingStatus.PAUSED);
    assert.equal(paused.pausedReason, "feature_disabled");
    assert.ok(
      await prisma.outboxEvent.findFirst({
        where: { tenantId, type: "LISTING_STATUS_CHANGED", aggregateId: paused.id, createdAt: { gte: new Date(stamp) } },
      }),
    );

    const on = snapshot(12, [flag("clinic.kiorex_listing")]);
    snaps.setSnapshotForTests(on);
    await snaps.notifyChanged(diffSnapshots(off, on));
    const live = await prisma.marketplaceListing.findFirstOrThrow({ where: { clinicId, clinicianId } });
    assert.equal(live.status, ListingStatus.LIVE);
  });

  it("launch-locked specialty templates hide only when a snapshot exists AND marks them gate-unsatisfied", async () => {
    const snaps = new KiorexFlagSnapshotService(prismaSvc, {} as never);
    const flags = new FeatureFlagsService(prismaSvc, { resolve: async () => ({ entitlements: {} }) } as never, snaps);
    const key = "clinic.specialty_templates.DERMATOLOGY";
    assert.equal(await flags.isSpecialtyTemplateVisible(tenantId, key), true, "no snapshot => dev defaults show them");
    snaps.setSnapshotForTests(snapshot(1, [flag("clinic.ai_scribe")]));
    assert.equal(await flags.isSpecialtyTemplateVisible(tenantId, key), true, "snapshot without the flag => not marked");
    snaps.setSnapshotForTests(snapshot(2, [flag(key, { class: "Launch-locked", launchLocked: true, gateSatisfied: false })]));
    assert.equal(await flags.isSpecialtyTemplateVisible(tenantId, key), false, "gate-unsatisfied => hidden");
    snaps.setSnapshotForTests(snapshot(3, [flag(key, { class: "Launch-locked", launchLocked: true, gateSatisfied: true })]));
    assert.equal(await flags.isSpecialtyTemplateVisible(tenantId, key), true, "gate satisfied => shown");
    snaps.setSnapshotForTests(snapshot(4, [flag(key, { class: "Launch-locked", launchLocked: true, gateSatisfied: true, values: { global: "OFF" } })]));
    assert.equal(await flags.isSpecialtyTemplateVisible(tenantId, key), false, "switched OFF => hidden");
  });

  it("Kiorex record-share consent grants are blocked by clinic.record_share_patient_app OFF; revocations always pass", async () => {
    const snaps = new KiorexFlagSnapshotService(prismaSvc, {} as never);
    const flags = new FeatureFlagsService(prismaSvc, { resolve: async () => ({ entitlements: {} }) } as never, snaps);
    const svc = new RecordShareService(prismaSvc, flags);
    const patient = await prisma.patient.create({
      data: { tenantId, mrn: `KXW-RS-${stamp}`, firstNameEn: "Sara", lastNameEn: "Hany", gender: "UNKNOWN", phone: "+201055500777" },
    });
    snaps.setSnapshotForTests(snapshot(5, [flag("clinic.record_share_patient_app", { values: { global: "OFF" } })]));
    await assert.rejects(
      () => svc.upsertFromMarketplace(patient.id, [{ scope: "PRESCRIPTIONS", granted: true }]),
      (e: unknown) => e instanceof FeatureDisabledException,
    );
    await svc.upsertFromMarketplace(patient.id, [{ scope: "PRESCRIPTIONS", granted: false }]);
    snaps.setSnapshotForTests(snapshot(6, [flag("clinic.record_share_patient_app")]));
    const ok = await svc.upsertFromMarketplace(patient.id, [{ scope: "PRESCRIPTIONS", granted: true }]);
    assert.equal(ok.find((r) => r.scope === "PRESCRIPTIONS")?.granted, true);
  });

  it("waitlist: Kiorex join (idempotent) -> FS-03 offer emits WAITLIST_OFFER -> accept books a KIOREX_MARKETPLACE appointment; leave withdraws", async () => {
    const audit = new AuditService(prismaSvc);
    const outbox = new OutboxEventService(prismaSvc);
    const consent = new ConsentPolicyService(prismaSvc, audit);
    const autofill = new WaitlistAutofillService(
      prismaSvc,
      { queueMessage: async () => assert.fail("Kiorex-sourced offers must not use WhatsApp") } as never,
      { isEnabled: async () => true } as never,
      audit,
      new AppointmentOutboxService(outbox),
      { invalidateAndNotify: async () => undefined } as never,
      outbox,
    );
    const svc = new MarketplaceWaitlistService(
      prismaSvc,
      new MarketplaceAccessService(prismaSvc),
      new MarketplacePatientIntakeService(prismaSvc),
      consent,
      audit,
      autofill,
    );
    const ref = `kx_wl_${stamp}`;
    const body = {
      externalRef: ref,
      clinicId,
      clinicianId,
      patient: { phone: "+201055500888", firstNameEn: "Laila", lastNameEn: "Wafy" },
    };
    const joined = await svc.join(client, body);
    assert.equal(joined.status, "WAITING");
    assert.deepEqual(await svc.join(client, body), joined, "idempotent on externalRef");
    const entry = await prisma.appointmentWaitlistEntry.findUniqueOrThrow({ where: { externalRef: ref } });
    assert.equal(entry.source, "KIOREX");

    // A cancelled slot far enough ahead that the offer hold fits.
    const startsAt = new Date(Date.now() + 5 * 86_400_000 + Math.floor(Math.random() * 600) * 3_600_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const type = await prisma.appointmentType.findFirstOrThrow({ where: { clinicId, marketplaceBookable: true } });
    const slot = await prisma.waitlistOpenSlot.create({
      data: {
        tenantId,
        clinicId,
        clinicianId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        appointmentTypeId: type.id,
        openKey: `kxw-${stamp}`,
      },
    });
    await autofill.processTenant(tenantId);
    const offer = await prisma.waitlistSlotOffer.findFirstOrThrow({ where: { slotId: slot.id, waitlistEntryId: entry.id } });
    assert.equal(offer.status, "PENDING");
    assert.equal(offer.outboundMessageId, null);
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "WAITLIST_OFFER", aggregateId: offer.id } });
    const data = ev.payload as Record<string, unknown>;
    assert.equal(data.waitlistRef, ref);
    assert.equal(data.clinicId, clinicId);
    assert.ok(data.expiresAt && data.startsAt);

    const accepted = await svc.acceptOffer(client, offer.id);
    assert.equal(accepted.outcome, "BOOKED");
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: accepted.appointmentId! } });
    assert.equal(appt.bookingSource, "KIOREX_MARKETPLACE");
    assert.equal(appt.externalReference, ref);
    assert.equal(appt.platformIntegrationClientId, client.id);
    assert.equal(appt.status, AppointmentStatus.CONFIRMED);
    assert.equal((await prisma.waitlistOpenSlot.findUniqueOrThrow({ where: { id: slot.id } })).status, WaitlistOpenSlotStatus.FILLED);
    assert.equal((await svc.get(client, ref)).status, "BOOKED");
    assert.equal((await svc.acceptOffer(client, offer.id)).outcome, "UNAVAILABLE", "second accept is a no-op");

    // Leave on a fresh entry withdraws a pending offer and is idempotent.
    const ref2 = `kx_wl_${stamp}_b`;
    await svc.join(client, { ...body, externalRef: ref2, patient: { phone: "+201055500889", firstNameEn: "Omar", lastNameEn: "Said" } });
    const left = await svc.leave(client, ref2);
    assert.equal(left.status, "CANCELLED");
    assert.equal((await svc.leave(client, ref2)).status, "CANCELLED");
    await assert.rejects(() => svc.get({ ...client, id: "other-client" }, ref2));
  });
});
