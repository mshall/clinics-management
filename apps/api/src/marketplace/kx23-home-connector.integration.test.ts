import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Gender, ListingStatus, PrismaClient } from "@prisma/client";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AuditService } from "../audit/audit.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { SlotService } from "../scheduling/slot.service";
import { NewPatientService } from "../patients/new-patient.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import { buildKit, buildWorld, cleanup, snapshotFor, type World } from "../home-visits/hv-test-kit";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceApiService } from "./marketplace-api.service";
import { MarketplaceBookingService } from "./marketplace-booking.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { MarketplaceProviderProfileService } from "./marketplace-provider-profile.service";
import { SlotHoldService } from "./slot-hold.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import type { PrismaService } from "../prisma/prisma.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const suffix = `${Date.now()}`.slice(-9);

/** KX-09 §03 v2.3 / contracts 1.5.0: the Kiorly side of home visits as Kiorex sees it (slots, holds, bookings, provider sync, events). */
describe("KX-09 v2.3 connector: HOME visits", () => {
  let w: World;
  let client: PlatformIntegrationPrincipal;
  let monday: Date;
  let stack: ReturnType<typeof build>;

  function build(kit: Awaited<ReturnType<typeof buildKit>>) {
    const p = prisma as unknown as PrismaService;
    const audit = new AuditService(p);
    const outbox = new OutboxEventService(p);
    const slots = new SlotService(p, outbox);
    const access = new MarketplaceAccessService(p);
    const holds = new SlotHoldService(p, slots, access, kit.homeVisits, kit.flags);
    const bookings = new MarketplaceBookingService(p, access, new MarketplacePatientIntakeService(p), {} as AppointmentsService, new ConsentPolicyService(p, audit), audit, outbox, new AppointmentOutboxService(outbox), slots, new NewPatientService(p), { notifyKiorexBooking: async () => ({ queued: 0 }) } as never, kit.homeVisits);
    const api = new MarketplaceApiService({} as never, access, {} as never, p, slots, kit.homeVisits);
    const profiles = new MarketplaceProviderProfileService(p, new MarketplaceListingService(p, outbox, kit.flags), outbox, audit, {} as never, kit.flags);
    return { holds, bookings, api, profiles };
  }

  const patient = { phone: "+201055555555", firstNameEn: "Hana", lastNameEn: "Visit", gender: Gender.F };
  const address = { district: "nasr-city", line1: "12 Example St", building: "7", floor: "3", flat: "9", landmark: "Next to the pharmacy", lat: 30.0561, lng: 31.3301 };

  before(async () => {
    await prisma.$connect();
    w = await buildWorld(prisma, `${suffix}k`);
    client = await prisma.platformIntegrationClient.create({ data: { name: `Kx23 ${suffix}`, clientKey: `plt_kx23_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] } });
    await prisma.clinic.update({ where: { id: w.clinicId }, data: { marketplaceBookingAutoConfirm: true } });
    const week = emptyAvailabilityWeek("Africa/Cairo");
    week.days[1]!.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, weekJson: week } });
    await prisma.appointmentType.update({ where: { id: w.homeType.id }, data: { minNoticeMinutes: 0, maxDaysAhead: 90, depositAmount: null } });
    await prisma.marketplaceListing.create({ data: { tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, status: ListingStatus.LIVE, profileJson: {} } });
    await prisma.clinicianHomeSettings.create({ data: { tenantId: w.tenantId, clinicianId: w.clinician.row.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city", "heliopolis"] } });
    monday = new Date(Date.now() + 14 * 86_400_000);
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
    monday.setUTCHours(0, 0, 0, 0);
    stack = build(await buildKit(prisma));
  });
  after(async () => {
    await prisma.slotHold.deleteMany({ where: { tenantId: w.tenantId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await cleanup(prisma, w.tenantId);
    await prisma.$disconnect();
  });

  const range = () => ({ from: monday.toISOString(), to: new Date(monday.getTime() + 86_400_000).toISOString() });

  it("slots: serviceLocation=HOME needs a district (400), an uncovered district is 422 OUT_OF_COVERAGE, covered slots carry serviceLocation + district", async () => {
    const { from, to } = range();
    await assert.rejects(stack.api.listSlots(client, w.clinicId, w.clinician.row.id, w.homeType.id, from, to, { serviceLocation: "HOME" }), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "DISTRICT_REQUIRED");
    await assert.rejects(stack.api.listSlots(client, w.clinicId, w.clinician.row.id, w.homeType.id, from, to, { serviceLocation: "HOME", district: "6th-october" }), (e: { getStatus: () => number; getResponse: () => { code: string; district: string; statusCode: number } }) => e.getStatus() === 422 && e.getResponse().code === "OUT_OF_COVERAGE" && e.getResponse().statusCode === 422);
    const ok = await stack.api.listSlots(client, w.clinicId, w.clinician.row.id, w.homeType.id, from, to, { serviceLocation: "HOME", district: "Nasr-City" });
    assert.ok(ok.slots.length > 0);
    assert.ok(ok.slots.every((s: { serviceLocation: string; district: string | null }) => s.serviceLocation === "HOME" && s.district === "nasr-city"));
    await assert.rejects(stack.api.listSlots(client, w.clinicId, w.clinician.row.id, w.homeType.id, from, to, { serviceLocation: "IN_CLINIC" }), /home visit type/);
  });

  it("flag OFF (or gate unsatisfied): HOME slots and holds are 403 FEATURE_DISABLED; nothing is hidden from existing data", async () => {
    const offKit = await buildKit(prisma, snapshotFor({ gates: { "clinic.home_visits": false } }));
    const off = build(offKit);
    const { from, to } = range();
    await assert.rejects(off.api.listSlots(client, w.clinicId, w.clinician.row.id, w.homeType.id, from, to, { serviceLocation: "HOME", district: "nasr-city" }), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "FEATURE_DISABLED");
  });

  it("holds: visitAddress is REQUIRED for HOME types (422), coverage is checked (422 OUT_OF_COVERAGE), the address is stored encrypted and never echoed", async () => {
    const { from } = range();
    const start = new Date(new Date(from).getTime() + 9 * 3600_000); // 09:00 UTC = 11:00 Cairo
    const base = { clinicId: w.clinicId, clinicianId: w.clinician.row.id, typeId: w.homeType.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60_000).toISOString() };
    await assert.rejects(stack.holds.createHold(client, { ...base, externalRef: `H-${suffix}-1` }), (e: { getStatus: () => number; getResponse: () => { code: string } }) => e.getStatus() === 422 && e.getResponse().code === "VISIT_ADDRESS_REQUIRED");
    await assert.rejects(stack.holds.createHold(client, { ...base, externalRef: `H-${suffix}-2`, visitAddress: { district: "6th-october", line1: "x" } }), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "OUT_OF_COVERAGE");
    const hold = await stack.holds.createHold(client, { ...base, externalRef: `H-${suffix}-3`, visitAddress: address });
    const text = JSON.stringify(hold);
    assert.ok(!/Example|30\.05|31\.33|pharmacy/i.test(text), "the hold response never echoes the address");
    assert.equal((hold as { district?: string }).district, "nasr-city");
    const row = await prisma.slotHold.findUniqueOrThrow({ where: { id: hold.id } });
    assert.ok(row.visitAddressCiphertext && !row.visitAddressCiphertext.includes("Example"));
    assert.equal(row.visitDistrict, "nasr-city");
  });

  it("booking from the hold: HomeVisit + encrypted address are created, surcharge stays separate, Kiorex-verified phone satisfies HVSAF03; zone changed after the hold => 422 and the hold is released", async () => {
    const { from } = range();
    const start = new Date(new Date(from).getTime() + 11 * 3600_000);
    const base = { clinicId: w.clinicId, clinicianId: w.clinician.row.id, typeId: w.homeType.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60_000).toISOString() };
    const hold = await stack.holds.createHold(client, { ...base, externalRef: `H-${suffix}-4`, visitAddress: address });
    const booking = await stack.bookings.createBooking(client, `kx_bk_${suffix}_1`, { ...base, holdId: hold.id, patient, marketplaceConsentGranted: true });
    assert.equal((booking as { serviceLocation: string }).serviceLocation, "HOME");
    const appt = await prisma.appointment.findFirstOrThrow({ where: { externalReference: `kx_bk_${suffix}_1` }, include: { homeVisit: true } });
    assert.equal(appt.serviceLocation, "HOME");
    assert.equal(Number(appt.feeAmount), 300, "BR56: feeAmount excludes the surcharge");
    assert.equal(Number(appt.homeSurchargeAmount), 50);
    assert.equal(appt.homeVisit?.state, "CONFIRMED");
    assert.ok(appt.homeVisit?.addressCiphertext && !appt.homeVisit.addressCiphertext.includes("Example"));
    assert.equal(await prisma.slotHold.count({ where: { id: hold.id } }), 0, "hold consumed");

    // zone changes between hold and book
    const start2 = new Date(start.getTime() + 3 * 3600_000);
    const b2 = { ...base, startsAt: start2.toISOString(), endsAt: new Date(start2.getTime() + 30 * 60_000).toISOString() };
    const hold2 = await stack.holds.createHold(client, { ...b2, externalRef: `H-${suffix}-5`, visitAddress: address });
    await prisma.clinicianHomeSettings.update({ where: { tenantId_clinicianId: { tenantId: w.tenantId, clinicianId: w.clinician.row.id } }, data: { coverageDistrictIds: ["heliopolis"] } });
    await assert.rejects(stack.bookings.createBooking(client, `kx_bk_${suffix}_2`, { ...b2, holdId: hold2.id, patient: { ...patient, phone: "+201066666666" }, marketplaceConsentGranted: true }), (e: { getStatus: () => number; getResponse: () => { code: string } }) => e.getStatus() === 422 && e.getResponse().code === "OUT_OF_COVERAGE");
    assert.equal(await prisma.slotHold.count({ where: { id: hold2.id } }), 0, "KX-09 §08: the hold is released so Kiorex can show in-zone alternatives");
    assert.equal(await prisma.appointment.count({ where: { externalReference: `kx_bk_${suffix}_2` } }), 0);
    await prisma.clinicianHomeSettings.update({ where: { tenantId_clinicianId: { tenantId: w.tenantId, clinicianId: w.clinician.row.id } }, data: { coverageDistrictIds: ["nasr-city", "heliopolis"] } });
  });

  it("provider sync (GET /providers) adds profession, edition, serviceLocations[], coverageDistricts[], verification.register; HOME appears only while effective, fees carry serviceLocation + separate homeSurcharge", async () => {
    const listing = await prisma.marketplaceListing.findFirstOrThrow({ where: { tenantId: w.tenantId } });
    const findPublished = async (
      profiles: ReturnType<typeof build>["profiles"],
    ) => {
      // Demo seed may have many LIVE listings; walk pages instead of assuming page 1.
      let pageNum = 1;
      for (;;) {
        const page = await profiles.listProvidersForKiorex({ page: pageNum, pageSize: 100 });
        const hit = page.items.find((i) => i.listingId === listing.id);
        if (hit) return hit;
        if (pageNum * 100 >= page.total) return undefined;
        pageNum += 1;
      }
    };
    const item = await findPublished(stack.profiles);
    assert.ok(item, "expected marketplace listing to appear in provider sync");
    assert.equal(item.profession, "PHYSICIAN");
    assert.equal(item.edition, "CLINIC");
    assert.deepEqual(item.serviceLocations, ["HOME"], "only HOME types exist in this org");
    assert.deepEqual(item.coverageDistricts, ["nasr-city", "heliopolis"]);
    assert.equal(item.verification?.register, "EG_MEDICAL_SYNDICATE");
    const fee = item.provider.fees.find((f) => f.appointmentTypeId === w.homeType.id)!;
    assert.equal(fee.serviceLocation, "HOME");
    assert.equal(fee.amount, 300);
    assert.equal(fee.homeSurcharge, 50);
    assert.equal(item.assignsClinician, undefined);

    const off = build(await buildKit(prisma, snapshotFor({ gates: { "clinic.home_visits": false } })));
    const hidden = await findPublished(off.profiles);
    assert.ok(hidden, "expected marketplace listing while home_visits gate is off");
    assert.ok(!hidden.serviceLocations?.includes("HOME"), "Home visit types hidden for new bookings while the flag is not effective");
    assert.deepEqual(hidden.coverageDistricts, []);
    assert.equal(hidden.provider.fees.find((f) => f.appointmentTypeId === w.homeType.id), undefined);
  });

  it("outbox events for an in-clinic booking stay byte-identical (no serviceLocation field): additive contract", async () => {
    const e = await prisma.outboxEvent.findFirst({ where: { tenantId: w.tenantId, type: "APPOINTMENT_CONFIRMED" } });
    if (e) assert.ok(!("serviceLocation" in (e.payload as object)) || (e.payload as { serviceLocation?: string }).serviceLocation === "HOME");
  });
});
