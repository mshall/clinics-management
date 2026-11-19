import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { effectiveVerificationStatus, verificationBadge } from "../clinician-verification/profession-verification";
import { resolveProfessionPack } from "../scope-of-practice/profession-pack";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import { Prisma } from "@prisma/client";
import { SlotService } from "../scheduling/slot.service";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import {
  KIOREX_CANCELLATION_POLICY_DEFAULTS,
  kiorexCancellationPolicySchema,
  safeParseCommercialConfig,
} from "../markets/commercial-config.schema";
import { PrismaService } from "../prisma/prisma.service";
import { resolveKiorexCancellationPolicy } from "./kiorex-booking-policy";
import { MarketplaceListingService } from "./marketplace-listing.service";

export type PutKiorexSettingsBody = {
  clinicId: string;
  /** Partial override; `null` resets to the market default. */
  cancellationPolicy?: Record<string, unknown> | null;
  /** KX-10: confirm Kiorex bookings automatically (true) or keep them pending for the front desk (false). */
  autoConfirm?: boolean;
  /** KX-10: per-doctor listing toggle and daily Kiorex booking cap. */
  doctors?: { listingId: string; listed?: boolean; dailyCap?: number }[];
  /** KX-10: per visit type — bookable on Kiorex, min notice, booking horizon, deposit. */
  appointmentTypes?: {
    id: string;
    marketplaceBookable?: boolean;
    minNoticeMinutes?: number;
    maxDaysAhead?: number;
    depositAmount?: number | null;
  }[];
};

export const KIOREX_SETTINGS_LIMITS = {
  dailyCapMax: 200,
  minNoticeMinutesMax: 14 * 24 * 60,
  maxDaysAheadMin: 1,
  maxDaysAheadMax: 365,
} as const;

function intInRange(v: unknown, min: number, max: number, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException({ code: "INVALID_KIOREX_SETTING", field, message: `${field} must be an integer ${min}–${max}` });
  }
  return n;
}

@Injectable()
export class KiorexSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: MarketplaceListingService,
    private readonly audit: AuditService,
    private readonly slots: SlotService,
  ) {}

  private async loadClinic(user: JwtUser, clinicId: string) {
    if (!clinicId) throw new BadRequestException("clinicId is required");
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: user.tenantId ?? undefined },
      select: {
        id: true,
        tenantId: true,
        kiorexCancellationPolicy: true,
        marketplaceBookingAutoConfirm: true,
        tenant: { select: { market: { select: { commercialConfig: true, code: true, clinicalConfig: true } } } },
      },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    this.listings.assertClinicManage(user, clinic.tenantId);
    return clinic;
  }

  async get(user: JwtUser, clinicId: string) {
    const clinic = await this.loadClinic(user, clinicId);
    const marketCfg = safeParseCommercialConfig(clinic.tenant.market?.commercialConfig);
    const listings = await this.listings.listClinicListings(user, clinic.id, false);
    const clinicianIds = listings.map((l) => l.clinicianId);
    const [verifications, users, templates, types] = await Promise.all([
      this.prisma.clinicianVerification.findMany({
        where: { tenantId: clinic.tenantId, userId: { in: clinicianIds } },
        select: { userId: true, status: true, verifiedProfession: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId: clinic.tenantId, id: { in: clinicianIds } },
        select: { id: true, profession: true, role: true, additionalRoles: true },
      }),
      this.prisma.clinicianAvailabilityTemplate.findMany({
        where: { tenantId: clinic.tenantId, clinicId: clinic.id, clinicianId: { in: clinicianIds } },
        select: { clinicianId: true, marketplaceDailyCap: true },
      }),
      this.prisma.appointmentType.findMany({
        where: { tenantId: clinic.tenantId, isActive: true, OR: [{ clinicId: clinic.id }, { clinicId: null }] },
        select: {
          id: true,
          clinicId: true,
          nameEn: true,
          nameAr: true,
          feeAmount: true,
          marketplaceBookable: true,
          minNoticeMinutes: true,
          maxDaysAhead: true,
          depositAmount: true,
        },
        orderBy: { nameEn: "asc" },
      }),
    ]);
    const verificationBy = new Map(verifications.map((v) => [v.userId, v.status]));
    const verifiedProfessionBy = new Map(verifications.map((v) => [v.userId, v.verifiedProfession]));
    const professionBy = new Map(users.map((u) => [u.id, effectiveProfession(u)]));
    const pack = resolveProfessionPack(clinic.tenant.market);
    const capBy = new Map(templates.map((t) => [t.clinicianId, t.marketplaceDailyCap]));
    return {
      clinicId: clinic.id,
      autoConfirm: clinic.marketplaceBookingAutoConfirm,
      doctors: listings.map((l) => ({
        listingId: l.id,
        clinicianId: l.clinicianId,
        clinicianName: l.clinicianName,
        status: l.status,
        pausedReason: l.pausedReason,
        blockers: l.blockers,
        completenessPercent: l.completenessPercent,
        verificationStatus: verificationBy.get(l.clinicianId) ?? null,
        // PRVER02 — the badge names the profession ("Verified physiotherapist"); only counts when verified for the current profession.
        profession: professionBy.get(l.clinicianId) ?? null,
        badge: verificationBadge(
          pack,
          professionBy.get(l.clinicianId) ?? null,
          effectiveVerificationStatus(
            { status: verificationBy.get(l.clinicianId) ?? "UNVERIFIED", verifiedProfession: verifiedProfessionBy.get(l.clinicianId) ?? null },
            professionBy.get(l.clinicianId) ?? null,
            pack,
          ),
        ),
        dailyCap: capBy.get(l.clinicianId) ?? null,
      })),
      appointmentTypes: types.map((t) => ({
        id: t.id,
        nameEn: t.nameEn,
        nameAr: t.nameAr,
        sharedAcrossBranches: t.clinicId === null,
        feeAmount: Number(t.feeAmount),
        marketplaceBookable: t.marketplaceBookable,
        minNoticeMinutes: t.minNoticeMinutes,
        maxDaysAhead: t.maxDaysAhead,
        depositAmount: t.depositAmount != null ? Number(t.depositAmount) : null,
      })),
      cancellationPolicy: {
        effective: resolveKiorexCancellationPolicy(clinic.tenant.market?.commercialConfig, clinic.kiorexCancellationPolicy),
        marketDefault: (marketCfg.success && marketCfg.data.kiorex.cancellationPolicy) || KIOREX_CANCELLATION_POLICY_DEFAULTS,
        override: clinic.kiorexCancellationPolicy ?? null,
      },
    };
  }

  async put(user: JwtUser, body: PutKiorexSettingsBody) {
    const clinic = await this.loadClinic(user, body.clinicId);
    if (body.cancellationPolicy !== undefined) {
      let next: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
      if (body.cancellationPolicy !== null) {
        const parsed = kiorexCancellationPolicySchema.partial().strict().safeParse(body.cancellationPolicy);
        if (!parsed.success) {
          throw new BadRequestException({ code: "INVALID_CANCELLATION_POLICY", issues: parsed.error.issues });
        }
        next = parsed.data as Prisma.InputJsonValue;
      }
      await this.prisma.clinic.update({ where: { id: clinic.id }, data: { kiorexCancellationPolicy: next } });
      await this.audit.recordEvent({
        tenantId: clinic.tenantId,
        actorId: user.userId,
        clinicId: clinic.id,
        action: "kiorex.settings.cancellation_policy_updated",
        resource: "Clinic",
        resourceId: clinic.id,
        metadata: { before: clinic.kiorexCancellationPolicy ?? null, after: body.cancellationPolicy },
      });
    }
    if (body.autoConfirm !== undefined) {
      if (typeof body.autoConfirm !== "boolean") throw new BadRequestException("autoConfirm must be a boolean");
      if (body.autoConfirm !== clinic.marketplaceBookingAutoConfirm) {
        await this.prisma.clinic.update({ where: { id: clinic.id }, data: { marketplaceBookingAutoConfirm: body.autoConfirm } });
        await this.recordSettingsAudit(user, clinic, "kiorex.settings.auto_confirm_updated", "Clinic", clinic.id, {
          before: clinic.marketplaceBookingAutoConfirm,
          after: body.autoConfirm,
        });
      }
    }
    if (body.doctors?.length) await this.applyDoctorSettings(user, clinic, body.doctors);
    if (body.appointmentTypes?.length) await this.applyTypeSettings(user, clinic, body.appointmentTypes);
    return this.get(user, clinic.id);
  }

  private async recordSettingsAudit(
    user: JwtUser,
    clinic: { id: string; tenantId: string },
    action: string,
    resource: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.recordEvent({
      tenantId: clinic.tenantId,
      actorId: user.userId,
      clinicId: clinic.id,
      action,
      resource,
      resourceId,
      metadata,
    });
  }

  private async applyDoctorSettings(
    user: JwtUser,
    clinic: { id: string; tenantId: string },
    doctors: NonNullable<PutKiorexSettingsBody["doctors"]>,
  ) {
    for (const d of doctors) {
      const listing = await this.prisma.marketplaceListing.findFirst({
        where: { id: d.listingId, clinicId: clinic.id },
        select: { id: true, clinicianId: true, status: true, pausedReason: true },
      });
      if (!listing) throw new NotFoundException("Listing not found");
      if (d.listed !== undefined) {
        const wasListed = listing.pausedReason !== "owner";
        if (d.listed !== wasListed) {
          const after = await this.listings.pauseByOwner(user, listing.id, !d.listed);
          await this.recordSettingsAudit(user, clinic, "kiorex.settings.listing_toggled", "MarketplaceListing", listing.id, {
            listed: d.listed,
            statusBefore: listing.status,
            statusAfter: after.status,
          });
        }
      }
      if (d.dailyCap !== undefined) {
        const cap = intInRange(d.dailyCap, 0, KIOREX_SETTINGS_LIMITS.dailyCapMax, "dailyCap");
        const template = await this.prisma.clinicianAvailabilityTemplate.findUnique({
          where: {
            tenantId_clinicId_clinicianId: { tenantId: clinic.tenantId, clinicId: clinic.id, clinicianId: listing.clinicianId },
          },
          select: { id: true, marketplaceDailyCap: true },
        });
        if (!template) {
          throw new BadRequestException({
            code: "NO_AVAILABILITY_TEMPLATE",
            message: "Set this doctor's weekly availability before capping Kiorex bookings",
          });
        }
        if (template.marketplaceDailyCap !== cap) {
          await this.prisma.clinicianAvailabilityTemplate.update({ where: { id: template.id }, data: { marketplaceDailyCap: cap } });
          await this.recordSettingsAudit(user, clinic, "kiorex.settings.daily_cap_updated", "MarketplaceListing", listing.id, {
            before: template.marketplaceDailyCap,
            after: cap,
          });
          await this.slots.invalidateAndNotify(clinic.tenantId, clinic.id, listing.clinicianId, "kiorex_settings");
        }
      }
    }
  }

  private async applyTypeSettings(
    user: JwtUser,
    clinic: { id: string; tenantId: string },
    types: NonNullable<PutKiorexSettingsBody["appointmentTypes"]>,
  ) {
    let changed = false;
    for (const t of types) {
      const row = await this.prisma.appointmentType.findFirst({
        where: { id: t.id, tenantId: clinic.tenantId, OR: [{ clinicId: clinic.id }, { clinicId: null }] },
        select: {
          id: true,
          feeAmount: true,
          marketplaceBookable: true,
          minNoticeMinutes: true,
          maxDaysAhead: true,
          depositAmount: true,
        },
      });
      if (!row) throw new NotFoundException("Appointment type not found");
      const data: Prisma.AppointmentTypeUpdateInput = {};
      if (t.marketplaceBookable !== undefined) data.marketplaceBookable = Boolean(t.marketplaceBookable);
      if (t.minNoticeMinutes !== undefined) {
        data.minNoticeMinutes = intInRange(t.minNoticeMinutes, 0, KIOREX_SETTINGS_LIMITS.minNoticeMinutesMax, "minNoticeMinutes");
      }
      if (t.maxDaysAhead !== undefined) {
        data.maxDaysAhead = intInRange(
          t.maxDaysAhead,
          KIOREX_SETTINGS_LIMITS.maxDaysAheadMin,
          KIOREX_SETTINGS_LIMITS.maxDaysAheadMax,
          "maxDaysAhead",
        );
      }
      if (t.depositAmount !== undefined) {
        if (t.depositAmount === null || Number(t.depositAmount) === 0) {
          data.depositAmount = null;
        } else {
          const dep = Number(t.depositAmount);
          if (!Number.isFinite(dep) || dep < 0 || dep > Number(row.feeAmount)) {
            throw new BadRequestException({
              code: "INVALID_KIOREX_SETTING",
              field: "depositAmount",
              message: "Deposit must be between 0 and the visit fee",
            });
          }
          data.depositAmount = new Prisma.Decimal(dep.toFixed(2));
        }
      }
      if (!Object.keys(data).length) continue;
      await this.prisma.appointmentType.update({ where: { id: row.id }, data });
      await this.recordSettingsAudit(user, clinic, "kiorex.settings.appointment_type_updated", "AppointmentType", row.id, {
        before: {
          marketplaceBookable: row.marketplaceBookable,
          minNoticeMinutes: row.minNoticeMinutes,
          maxDaysAhead: row.maxDaysAhead,
          depositAmount: row.depositAmount != null ? Number(row.depositAmount) : null,
        },
        after: {
          marketplaceBookable: data.marketplaceBookable,
          minNoticeMinutes: data.minNoticeMinutes,
          maxDaysAhead: data.maxDaysAhead,
          depositAmount: t.depositAmount === undefined ? undefined : (t.depositAmount ?? null),
        },
      });
      changed = true;
    }
    if (changed) {
      const listings = await this.prisma.marketplaceListing.findMany({ where: { clinicId: clinic.id }, select: { clinicianId: true } });
      for (const l of listings) {
        await this.slots.invalidateAndNotify(clinic.tenantId, clinic.id, l.clinicianId, "kiorex_settings");
      }
    }
  }
}
