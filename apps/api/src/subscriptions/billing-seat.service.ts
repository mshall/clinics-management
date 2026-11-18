import { BadRequestException, Injectable } from "@nestjs/common";
import { UserRole, type Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { assertSubscriptionBillingAccess } from "./subscription-access";

@Injectable()
export class BillingSeatService {
  constructor(private readonly prisma: PrismaService) {}

  async listPhysicians(tenantId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: UserRole.PHYSICIAN,
      },
      select: { id: true, displayName: true, email: true, billingSeatActive: true, isTenantOwner: true },
      orderBy: { displayName: "asc" },
    });
  }

  /** Keep owner active; trim extras to seat cap. */
  async reconcileToSeatCap(tenantId: string, seatCap: number, activeUserIds?: string[]) {
    const physicians = await this.listPhysicians(tenantId);
    if (physicians.length <= seatCap) {
      const updates = physicians.map((p) =>
        this.prisma.user.update({
          where: { id: p.id },
          data: { billingSeatActive: true },
        }),
      );
      await this.prisma.$transaction(updates);
      return;
    }

    const owner = physicians.find((p) => p.isTenantOwner);
    const chosen = new Set<string>();
    if (activeUserIds?.length) {
      for (const id of activeUserIds) {
        if (physicians.some((p) => p.id === id)) chosen.add(id);
      }
    }
    if (owner) chosen.add(owner.id);
    while (chosen.size < seatCap) {
      const next = physicians.find((p) => !chosen.has(p.id));
      if (!next) break;
      chosen.add(next.id);
    }
    if (chosen.size > seatCap) {
      throw new BadRequestException("Too many active clinicians selected for the new seat count");
    }

    await this.prisma.$transaction(
      physicians.map((p) =>
        this.prisma.user.update({
          where: { id: p.id },
          data: { billingSeatActive: chosen.has(p.id) },
        }),
      ),
    );
  }

  async setActivePhysicians(user: JwtUser, tenantId: string, activeUserIds: string[]) {
    if (user.tenantId !== tenantId) throw new BadRequestException("tenant mismatch");
    assertSubscriptionBillingAccess(user);
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new BadRequestException("Subscription not found");
    await this.reconcileToSeatCap(tenantId, sub.clinicianSeats, activeUserIds);
    return this.listPhysicians(tenantId);
  }
}