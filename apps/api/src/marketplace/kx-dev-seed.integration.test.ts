import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ListingStatus, PrismaClient } from "@prisma/client";
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
    assert.deepEqual(row.scopes, ["MARKETPLACE"]);
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

  it("each doctor has bookable marketplace slots over the next 14 days", async () => {
    const slots = new SlotService(prismaSvc, new OutboxEventService(prismaSvc));
    const from = new Date();
    const to = new Date(Date.now() + 14 * 86_400_000);
    for (const d of KX_DEV_DOCTORS) {
      const user = await prisma.user.findFirstOrThrow({ where: { email: d.email } });
      const l = await prisma.marketplaceListing.findFirstOrThrow({ where: { clinicianId: user.id } });
      const type = await prisma.appointmentType.findFirstOrThrow({
        where: { clinicId: l.clinicId, nameEn: "Consultation", marketplaceBookable: true },
      });
      const out = await slots.getSlots({
        tenantId: l.tenantId,
        clinicId: l.clinicId,
        clinicianId: user.id,
        typeId: type.id,
        from,
        to,
        channel: SLOT_CHANNEL.MARKETPLACE,
      });
      const list = (Array.isArray(out) ? out : ((out as { slots?: unknown[] }).slots ?? [])) as { start?: string; startsAt?: string }[];
      assert.ok(list.length >= 20, `${d.nameEn}: only ${list.length} slots`);
      const days = new Set(list.map((s) => String(s.start ?? s.startsAt).slice(0, 10)));
      assert.ok(days.size >= 8, `${d.nameEn}: slots on only ${days.size} days`);
    }
  });
});
