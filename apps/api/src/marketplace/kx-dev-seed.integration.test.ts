import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, LeaveStatus, ListingStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  ensureKiorexDevIntegration,
  KX_DEV_CLIENT_KEY,
  KX_DEV_CLIENT_SECRET,
  KX_DEV_DOCTORS,
  KX_DEV_TENANT_NAME,
} from "../../prisma/kiorex-dev.seed";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { DateTime } from "luxon";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("KX-DEV local Kiorex integration seed", () => {
  before(async () => {
    await prisma.$connect();
    await ensureKiorexDevIntegration(prisma);
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("is idempotent", async () => {
    const count = async () => ({
      clients: await prisma.platformIntegrationClient.count({ where: { clientKey: KX_DEV_CLIENT_KEY } }),
      tenants: await prisma.tenant.count({ where: { name: KX_DEV_TENANT_NAME } }),
      listings: await prisma.marketplaceListing.count({ where: { tenant: { name: KX_DEV_TENANT_NAME } } }),
      types: await prisma.appointmentType.count({ where: { tenant: { name: KX_DEV_TENANT_NAME } } }),
    });
    const before = await count();
    await ensureKiorexDevIntegration(prisma);
    assert.deepEqual(await count(), before);
    assert.deepEqual(before, { clients: 1, tenants: 1, listings: 3, types: 4 });
  });

  it("marketplace client kx_dev_client / kx_dev_secret_change_me has MARKETPLACE scope", async () => {
    const row = await prisma.platformIntegrationClient.findUniqueOrThrow({ where: { clientKey: KX_DEV_CLIENT_KEY } });
    assert.ok(await bcrypt.compare(KX_DEV_CLIENT_SECRET, row.secretHash));
    assert.ok(row.scopes.includes("MARKETPLACE"));
    assert.deepEqual([...row.scopes].sort(), ["MARKETPLACE", "ONBOARDING_IMPORT"].sort());
    assert.equal(row.deactivatedAt, null);
  });

  it("3 LIVE verified doctors across 2 Cairo/Giza clinics; real eligibility recompute keeps them LIVE", async () => {
    const listings = await prisma.marketplaceListing.findMany({
      where: { tenant: { name: KX_DEV_TENANT_NAME } },
      include: { clinic: true, clinician: { include: { clinicianVerification: true } } },
    });
    assert.equal(listings.length, 3);
    assert.deepEqual([...new Set(listings.map((l) => l.clinic.city))].sort(), ["Cairo", "Giza"]);
    assert.deepEqual(
      listings.map((l) => l.clinician.clinicianVerification?.specialty).sort(),
      ["CARDIOLOGY", "DERMATOLOGY", "PEDIATRICS"],
    );
    const svc = new MarketplaceListingService(prismaSvc, new OutboxEventService(prismaSvc));
    for (const l of listings) {
      assert.equal(l.clinician.clinicianVerification?.status, "VERIFIED");
      const re = await svc.recomputeListing(l.id);
      assert.equal(re.status, ListingStatus.LIVE, `${l.clinician.displayName} blockers: ${JSON.stringify(re)}`);
    }
  });

  /**
   * Deterministic by construction. The seed is a shared, long-lived fixture: other suites (waitlist, marketplace extras) book, hold and block time on these same doctors,
   * and the old version of this test read "now to now + 14 days", so it also depended on the hour it ran. This version
   *  1. puts the doctors' mutable availability state back to what the seed defines (no blocked periods, the default marketplace daily cap of 20, no approved leave,
   *     no live holds, no future appointment left over from another run), only inside the seeded tenant;
   *  2. reads a fixed window: the 14 local days that start at the next Cairo midnight (never depends on the time of day or on a partly elapsed day);
   *  3. derives the expected number of bookable days from the seed's own week template (Friday off) instead of a magic number.
   */
  it("each doctor has bookable marketplace slots over the next 14 days (state reset, fixed Cairo-day window)", async () => {
    const slots = new SlotService(prismaSvc, new OutboxEventService(prismaSvc));
    const zone = "Africa/Cairo";
    const start = DateTime.now().setZone(zone).plus({ days: 1 }).startOf("day");
    const from = start.toJSDate();
    const to = start.plus({ days: 14 }).toJSDate();
    const workingDays = Array.from({ length: 14 }, (_, i) => start.plus({ days: i })).filter((d) => d.weekday !== 5).length; // seed: Friday off
    assert.equal(workingDays, 12, "any 14 consecutive days contain exactly two Fridays");
    for (const d of KX_DEV_DOCTORS) {
      const user = await prisma.user.findFirstOrThrow({ where: { email: d.email } });
      const l = await prisma.marketplaceListing.findFirstOrThrow({ where: { clinicianId: user.id } });
      const tenantId = l.tenantId;
      // 1. reset state other suites may have left behind (scoped to this seeded tenant and this clinician)
      await prisma.clinicianAvailabilityTemplate.updateMany({ where: { tenantId, clinicId: l.clinicId, clinicianId: user.id }, data: { blockedJson: [], marketplaceDailyCap: 20 } });
      await prisma.slotHold.deleteMany({ where: { tenantId, clinicianId: user.id } });
      await prisma.appointment.updateMany({ where: { tenantId, clinicianId: user.id, startsAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) }, status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED] } }, data: { status: AppointmentStatus.CANCELLED } });
      const employee = await prisma.employee.findFirst({ where: { tenantId, userId: user.id, deletedAt: null } });
      if (employee) await prisma.leaveRequest.updateMany({ where: { employeeId: employee.id, status: LeaveStatus.APPROVED, startDate: { lte: to }, endDate: { gte: from } }, data: { status: LeaveStatus.REJECTED } });

      const type = await prisma.appointmentType.findFirstOrThrow({ where: { clinicId: l.clinicId, nameEn: "Consultation", marketplaceBookable: true } });
      const out = await slots.getSlots({ tenantId, clinicId: l.clinicId, clinicianId: user.id, typeId: type.id, from, to, channel: SLOT_CHANNEL.MARKETPLACE });
      const list = (Array.isArray(out) ? out : ((out as { slots?: unknown[] }).slots ?? [])) as { start?: string; startsAt?: string }[];
      assert.ok(list.length >= 20, `${d.nameEn}: only ${list.length} slots`);
      const days = new Set(list.map((s) => DateTime.fromISO(String(s.start ?? s.startsAt)).setZone(zone).toISODate()));
      assert.ok(days.size >= 8, `${d.nameEn}: slots on only ${days.size} days`);
      assert.ok(days.size <= workingDays, `${d.nameEn}: slots on ${days.size} days but only ${workingDays} are working days`);
      assert.ok(![...days].some((x) => DateTime.fromISO(x as string).weekday === 5), `${d.nameEn}: a slot on a Friday (day off in the seed)`);
    }
  });
});
