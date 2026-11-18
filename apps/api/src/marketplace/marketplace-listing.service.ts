import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ClinicRecordStatus,
  ListingStatus,
  Prisma,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { activeSchedulingPhysicianWhere } from "../common/active-scheduling-physician";
import { hasAnyRoleInSet } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeWeekJson } from "../scheduling/availability-week-schema";
import {
  evaluateMarketplaceListingEligibility,
  type MarketplaceBlockerCode,
} from "./marketplace-listing-eligibility";
import { parseProviderProfileJson, providerProfileCompletenessPercent } from "./provider-profile-schema";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";

const CLINIC_ADMIN_ROLES = new Set<UserRole>([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);

export type MarketplaceListingDto = {
  id: string;
  clinicId: string;
  clinicianId: string;
  clinicianName: string;
  status: ListingStatus;
  pausedReason: string | null;
  blockers: MarketplaceBlockerCode[];
  completenessPercent: number;
  listedAt: string | null;
  updatedAt: string;
};

function weekHasBookableSlots(weekJson: unknown): boolean {
  const week = normalizeWeekJson(weekJson, "UTC");
  return week.days.some((day) => day.slots.length > 0);
}

@Injectable()
export class MarketplaceListingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxEventService,
  ) {}

  assertClinicManage(user: JwtUser, tenantId: string) {
    if (!user.tenantId || user.tenantId !== tenantId || !hasAnyRoleInSet(user, CLINIC_ADMIN_ROLES)) {
      throw new BadRequestException("Clinic admin role required");
    }
  }

  async listClinicListings(user: JwtUser, clinicId: string, sync = true): Promise<MarketplaceListingDto[]> {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: user.tenantId ?? undefined },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    this.assertClinicManage(user, clinic.tenantId);

    const physicians = await this.prisma.user.findMany({
      where: {
        ...activeSchedulingPhysicianWhere(clinic.tenantId),
        OR: [{ employee: { is: null } }, { employee: { is: { clinicId } } }],
      },
      select: { id: true, displayName: true },
      take: 200,
    });

    for (const p of physicians) {
      await this.prisma.marketplaceListing.upsert({
        where: { clinicId_clinicianId: { clinicId, clinicianId: p.id } },
        create: {
          tenantId: clinic.tenantId,
          clinicId,
          clinicianId: p.id,
        },
        update: {},
      });
    }

    if (sync) {
      const rows = await this.prisma.marketplaceListing.findMany({ where: { clinicId } });
      for (const row of rows) {
        await this.recomputeListing(row.id);
      }
    }

    const refreshed = await this.prisma.marketplaceListing.findMany({
      where: { clinicId },
      include: { clinician: { select: { displayName: true } } },
      orderBy: { clinician: { displayName: "asc" } },
    });

    const clinicGeo = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { latitude: true, longitude: true, addressEn: true, addressAr: true },
    });
    const typeCount = await this.prisma.appointmentType.count({
      where: {
        tenantId: clinic.tenantId,
        marketplaceBookable: true,
        isActive: true,
        OR: [{ clinicId }, { clinicId: null }],
      },
    });
    return refreshed.map((r) => {
      const pct = providerProfileCompletenessPercent({
        profile: parseProviderProfileJson(r.profileJson),
        hasMarketplaceFees: typeCount > 0,
        clinicHasGeo: clinicGeo?.latitude != null && clinicGeo?.longitude != null,
        clinicHasAddress: Boolean(clinicGeo?.addressEn?.trim() && clinicGeo?.addressAr?.trim()),
      });
      return this.mapListing(r, undefined, pct);
    });
  }

  async pauseByOwner(user: JwtUser, listingId: string, paused: boolean) {
    const row = await this.prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!row) throw new NotFoundException("Listing not found");
    this.assertClinicManage(user, row.tenantId);
    await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: paused ? { status: ListingStatus.PAUSED, pausedReason: "owner" } : { pausedReason: null },
    });
    return this.recomputeListing(listingId);
  }

  async recomputeListing(listingId: string): Promise<MarketplaceListingDto> {
    const row = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { clinician: { select: { displayName: true } } },
    });
    if (!row) throw new NotFoundException("Listing not found");

    const ownerPaused = row.pausedReason === "owner";

    const [verification, subscription, typeCount, availability, clinic] = await Promise.all([
      this.prisma.clinicianVerification.findUnique({
        where: { userId: row.clinicianId },
        select: { status: true },
      }),
      this.prisma.subscription.findUnique({
        where: { tenantId: row.tenantId },
        select: { status: true },
      }),
      this.prisma.appointmentType.count({
        where: {
          tenantId: row.tenantId,
          marketplaceBookable: true,
          isActive: true,
          OR: [{ clinicId: row.clinicId }, { clinicId: null }],
        },
      }),
      this.prisma.clinicianAvailabilityTemplate.findUnique({
        where: {
          tenantId_clinicId_clinicianId: {
            tenantId: row.tenantId,
            clinicId: row.clinicId,
            clinicianId: row.clinicianId,
          },
        },
        select: { weekJson: true },
      }),
      this.prisma.clinic.findUnique({
        where: { id: row.clinicId },
        select: { latitude: true, longitude: true, addressEn: true, addressAr: true },
      }),
    ]);

    const profile = parseProviderProfileJson(row.profileJson);
    const completenessPercent = providerProfileCompletenessPercent({
      profile,
      hasMarketplaceFees: typeCount > 0,
      clinicHasGeo: clinic?.latitude != null && clinic?.longitude != null,
      clinicHasAddress: Boolean(clinic?.addressEn?.trim() && clinic?.addressAr?.trim()),
    });

    const eligibility = evaluateMarketplaceListingEligibility({
      verificationStatus: verification?.status ?? null,
      subscriptionStatus: subscription?.status ?? null,
      marketplaceBookableTypeCount: typeCount,
      hasAvailability: availability ? weekHasBookableSlots(availability.weekJson) : false,
      profileCompletenessPercent: completenessPercent,
      ownerPaused,
    });

    const data: Prisma.MarketplaceListingUpdateInput = {
      status: eligibility.status,
      pausedReason: eligibility.pausedReason,
    };
    if (eligibility.status === ListingStatus.LIVE && !row.listedAt) {
      data.listedAt = new Date();
    }
    if (eligibility.status !== ListingStatus.LIVE && eligibility.status !== ListingStatus.PAUSED) {
      data.listedAt = null;
    }

    const updated = await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data,
      include: { clinician: { select: { displayName: true } } },
    });
    if (row.status !== updated.status) {
      await this.outbox.enqueueEvent({
        tenantId: row.tenantId,
        type: OUTBOX_EVENT.LISTING_STATUS_CHANGED,
        aggregateType: "MarketplaceListing",
        aggregateId: listingId,
        payload: {
          listingId,
          clinicId: row.clinicId,
          clinicianId: row.clinicianId,
          previousStatus: row.status,
          nextStatus: updated.status,
        },
      });
    }
    return this.mapListing(updated, eligibility.blockers, completenessPercent);
  }

  async listMarketplaceClinics(): Promise<{ items: { id: string; nameEn: string; nameAr: string; tenantId: string }[] }> {
    const groups = await this.prisma.marketplaceListing.groupBy({
      by: ["clinicId", "tenantId"],
      where: { status: { in: [ListingStatus.LIVE, ListingStatus.PAUSED] } },
    });
    if (!groups.length) return { items: [] };
    const clinics = await this.prisma.clinic.findMany({
      where: {
        id: { in: groups.map((g) => g.clinicId) },
        recordStatus: ClinicRecordStatus.ACTIVE,
      },
      select: { id: true, nameEn: true, nameAr: true, tenantId: true },
    });
    return { items: clinics.map((c) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, tenantId: c.tenantId })) };
  }

  private mapListing(
    row: {
      id: string;
      clinicId: string;
      clinicianId: string;
      status: ListingStatus;
      pausedReason: string | null;
      listedAt: Date | null;
      updatedAt: Date;
      clinician: { displayName: string };
    },
    blockers: MarketplaceBlockerCode[] = [],
    completenessPercent = 0,
  ): MarketplaceListingDto {
    const derivedBlockers: MarketplaceBlockerCode[] =
      blockers.length > 0
        ? blockers
        : row.status === ListingStatus.LIVE
          ? []
          : ((row.pausedReason ? [row.pausedReason as MarketplaceBlockerCode] : []) as MarketplaceBlockerCode[]);
    return {
      id: row.id,
      clinicId: row.clinicId,
      clinicianId: row.clinicianId,
      clinicianName: row.clinician.displayName,
      status: row.status,
      pausedReason: row.pausedReason,
      blockers: derivedBlockers,
      completenessPercent,
      listedAt: row.listedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}