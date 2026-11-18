import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { DEFAULT_SLOT_HOLD_MINUTES, SLOT_TAKEN_CODE } from "./marketplace-booking.constants";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { addMinutes } from "../common/appointment-scheduling";

export type CreateSlotHoldInput = {
  clinicId: string;
  clinicianId: string;
  typeId: string;
  startsAt: string;
  endsAt?: string;
  externalRef: string;
};

@Injectable()
export class SlotHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotService,
    private readonly access: MarketplaceAccessService,
  ) {}

  async createHold(client: PlatformIntegrationPrincipal, body: CreateSlotHoldInput) {
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId, body.clinicianId);
    const start = new Date(body.startsAt);
    const end = body.endsAt ? new Date(body.endsAt) : addMinutes(start, 30);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException("Invalid startsAt/endsAt");
    }
    const ref = body.externalRef.trim();
    if (!ref) throw new BadRequestException("externalRef is required");

    const existingRef = await this.prisma.slotHold.findUnique({ where: { externalRef: ref } });
    if (existingRef && existingRef.expiresAt > new Date()) {
      return this.serializeHold(existingRef);
    }

    const available = await this.slots.getSlots({
      tenantId,
      clinicId: body.clinicId,
      clinicianId: body.clinicianId,
      typeId: body.typeId,
      from: addMinutes(start, -1),
      to: addMinutes(end, 1),
      channel: SLOT_CHANNEL.MARKETPLACE,
    });
    const ok = available.slots.some(
      (s) => new Date(s.startsAt).getTime() === start.getTime() && new Date(s.endsAt).getTime() === end.getTime(),
    );
    if (!ok) {
      throw new ConflictException({
        code: SLOT_TAKEN_CODE,
        message: "Slot is not available",
        alternatives: available.slots.slice(0, 3),
      });
    }

    try {
      const hold = await this.prisma.slotHold.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          clinicianId: body.clinicianId,
          appointmentTypeId: body.typeId,
          startsAt: start,
          endsAt: end,
          externalRef: ref,
          platformIntegrationClientId: client.id,
          expiresAt: addMinutes(new Date(), DEFAULT_SLOT_HOLD_MINUTES),
        },
      });
      await this.slots.invalidateAndNotify(tenantId, body.clinicId, body.clinicianId, "slot_hold_created");
      return this.serializeHold(hold);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: SLOT_TAKEN_CODE, message: "Hold or slot conflict" });
      }
      throw e;
    }
  }

  async releaseHold(client: PlatformIntegrationPrincipal, holdId: string) {
    const hold = await this.prisma.slotHold.findUnique({ where: { id: holdId } });
    if (!hold || hold.platformIntegrationClientId !== client.id) {
      throw new NotFoundException("Hold not found");
    }
    await this.prisma.slotHold.delete({ where: { id: holdId } });
    await this.slots.invalidateAndNotify(hold.tenantId, hold.clinicId, hold.clinicianId, "slot_hold_released");
    return { ok: true, id: holdId };
  }

  async releaseExpired(batch = 200): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.slotHold.findMany({
      where: { expiresAt: { lt: now } },
      take: batch,
      select: { id: true, tenantId: true, clinicId: true, clinicianId: true },
    });
    if (!expired.length) return 0;
    await this.prisma.slotHold.deleteMany({ where: { id: { in: expired.map((h) => h.id) } } });
    const seen = new Set<string>();
    for (const h of expired) {
      const key = `${h.tenantId}:${h.clinicId}:${h.clinicianId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await this.slots.invalidateAndNotify(h.tenantId, h.clinicId, h.clinicianId, "slot_hold_expired");
    }
    return expired.length;
  }

  private serializeHold(hold: {
    id: string;
    clinicId: string;
    clinicianId: string;
    appointmentTypeId: string;
    startsAt: Date;
    endsAt: Date;
    externalRef: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return {
      id: hold.id,
      clinicId: hold.clinicId,
      clinicianId: hold.clinicianId,
      typeId: hold.appointmentTypeId,
      startsAt: hold.startsAt.toISOString(),
      endsAt: hold.endsAt.toISOString(),
      externalRef: hold.externalRef,
      expiresAt: hold.expiresAt.toISOString(),
      createdAt: hold.createdAt.toISOString(),
    };
  }
}