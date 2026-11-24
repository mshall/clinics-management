import { EntitlementsService } from "../entitlements/entitlements.service";
import { telehealthOfferedBy } from "../telehealth/telehealth-availability";
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ListingStatus, Prisma, VerificationStatus } from "@prisma/client";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags-public";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import { resolveProfessionPack } from "../scope-of-practice/profession-pack";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { MarketplaceListingService } from "./marketplace-listing.service";
import {
  parseProviderProfileJson,
  profileTriggersVerificationRereview,
  PROVIDER_PROFILE_UPDATED_TOPIC,
  providerProfileCompletenessPercent,
  type ProviderProfileJson,
} from "./provider-profile-schema";
import type { PutProviderProfileDto } from "./dto/put-provider-profile.dto";

export type PublishedFee = {
  appointmentTypeId: string;
  nameEn: string;
  nameAr: string;
  amount: number;
  currency: string;
  /** KXM-PAY-01: the clinic's deposit for this visit type (null = none). Kiorex requires it before confirming payment. */
  depositAmount: number | null;
  /** Rev 2.3 (contracts 1.5.0): only present for HOME visit types. */
  /** ADR-039: VIDEO types are published only while telehealth is on and the doctor offers it. */
  serviceLocation?: "HOME" | "VIDEO";
  /** BR56: separate from `amount`; Kiorex shows amount + homeSurcharge; Kiorly never lets it enter commission (S) or the settlement base (C). */
  homeSurcharge?: number;
};

export function publishedFee(
  t: { id: string; nameEn: string; nameAr: string; feeAmount: unknown; depositAmount?: unknown; serviceLocation?: string; homeSurchargeAmount?: unknown },
  profileFee: unknown,
  currency: string,
): PublishedFee {
  const dep = t.depositAmount == null ? null : Number(t.depositAmount);
  return {
    appointmentTypeId: t.id,
    nameEn: t.nameEn,
    nameAr: t.nameAr,
    amount: Number(profileFee ?? t.feeAmount),
    currency,
    depositAmount: dep != null && dep > 0 ? dep : null,
    ...(t.serviceLocation === "HOME" ? { serviceLocation: "HOME" as const, homeSurcharge: t.homeSurchargeAmount == null ? 0 : Number(t.homeSurchargeAmount) } : {}),
    ...(t.serviceLocation === "VIDEO" ? { serviceLocation: "VIDEO" as const } : {}),
  };
}

export type ProviderProfileEditorDto = {
  listingId: string;
  clinicId: string;
  clinicianId: string;
  status: ListingStatus;
  profile: ProviderProfileJson;
  completenessPercent: number;
  clinic: {
    nameEn: string;
    nameAr: string;
    addressEn: string;
    addressAr: string;
    latitude: string | null;
    longitude: string | null;
    phone: string;
    logoUrl: string | null;
    clinicalSpecialty: string;
  };
  fees: { appointmentTypeId: string; nameEn: string; nameAr: string; feeAmount: string; currency: string }[];
  payers: { id: string; nameEn: string; nameAr: string }[];
  preview: PublishedProviderDto;
};

/** Contract names (1.6.0): IN_CLINIC, VIDEO, HOME_VISIT; the listing always offers at least one. */
export function modalitiesOf(inClinic: boolean, home: boolean, video: boolean): ("IN_CLINIC" | "VIDEO" | "HOME_VISIT")[] {
  const out: ("IN_CLINIC" | "VIDEO" | "HOME_VISIT")[] = [];
  if (inClinic) out.push("IN_CLINIC");
  if (video) out.push("VIDEO");
  if (home) out.push("HOME_VISIT");
  return out.length ? out : ["IN_CLINIC"];
}

export type PublishedProviderDto = {
  /** Rev 2.3 (KX-09 §03, contracts 1.5.0): additive provider-sync fields. */
  profession?: string;
  edition?: "CLINIC" | "NURSE";
  serviceLocations?: ("IN_CLINIC" | "HOME" | "VIDEO")[];
  /** GRW-GC-2 G-10 (marketplace 1.6.0, additive): care modalities offered; VIDEO = telemedicine is bookable. Mirrors `serviceLocations` with the contract's names. */
  modalities?: ("IN_CLINIC" | "VIDEO" | "HOME_VISIT")[];
  /** District codes only; no polygons or coordinates. */
  coverageDistricts?: string[];
  verification?: { register: string };
  /** Agencies only: the agency assigns a clinician after booking (HOME_VISIT_ASSIGNED). */
  assignsClinician?: boolean;
  /** GRW-P1-D1 (contracts 1.10.0): exact https origins allowed to embed the Kiorex booking widget (empty when the widget is off). */
  widgetOrigins?: string[];
  listingId: string;
  tenantId: string;
  clinicId: string;
  clinicianId: string;
  status: ListingStatus;
  completenessPercent: number;
  updatedAt: string;
  provider: ProviderProfileJson & {
    fees: PublishedFee[];
    payers: { id: string; nameEn: string; nameAr: string }[];
  };
  clinic: {
    nameEn: string;
    nameAr: string;
    addressEn: string;
    addressAr: string;
    latitude: number | null;
    longitude: number | null;
    phone: string;
    logoUrl: string | null;
    /** GRW-P1-G: the clinic booking slug (also the widget embed slug). Additive: the contract's `clinic` object is open. */
    bookingSlug?: string | null;
    clinicalSpecialty: string;
    parking: boolean;
    wheelchairAccess: boolean;
    amenities: string[];
    photos: string[];
  };
};

@Injectable()
export class MarketplaceProviderProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: MarketplaceListingService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  async getEditor(user: JwtUser, listingId: string): Promise<ProviderProfileEditorDto> {
    const row = await this.loadListingForTenant(user, listingId);
    return this.buildEditorDto(row);
  }

  async putProfile(user: JwtUser, listingId: string, body: PutProviderProfileDto): Promise<ProviderProfileEditorDto> {
    const row = await this.loadListingForTenant(user, listingId);
    const prev = parseProviderProfileJson(row.profileJson);
    const next: ProviderProfileJson = {
      ...prev,
      ...body.profile,
      feesByAppointmentTypeId: body.profile.feesByAppointmentTypeId ?? prev.feesByAppointmentTypeId,
      acceptedPayerIds: body.profile.acceptedPayerIds ?? prev.acceptedPayerIds,
      education: body.profile.education ?? prev.education,
      subSpecialties: body.profile.subSpecialties ?? prev.subSpecialties,
      languages: body.profile.languages ?? prev.languages,
      amenities: body.profile.amenities ?? prev.amenities,
      clinicPhotoRelativePaths: body.profile.clinicPhotoRelativePaths ?? prev.clinicPhotoRelativePaths,
    };

    if (body.clinicLatitude !== undefined || body.clinicLongitude !== undefined) {
      await this.prisma.clinic.update({
        where: { id: row.clinicId },
        data: {
          ...(body.clinicLatitude !== undefined ? { latitude: body.clinicLatitude } : {}),
          ...(body.clinicLongitude !== undefined ? { longitude: body.clinicLongitude } : {}),
        },
      });
    }

    const updated = await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { profileJson: next as Prisma.InputJsonValue },
      include: { clinician: { select: { displayName: true } } },
    });

    if (profileTriggersVerificationRereview(prev, next)) {
      await this.requestVerificationRereview(row.tenantId, row.clinicianId, user.userId);
    }

    const published = await this.buildPublishedFromRow({ ...updated, profileJson: next });
    await this.outbox.enqueue(row.tenantId, PROVIDER_PROFILE_UPDATED_TOPIC, {
      listingId,
      clinicId: row.clinicId,
      clinicianId: row.clinicianId,
      status: updated.status,
      completenessPercent: published.completenessPercent,
      updatedAt: updated.updatedAt.toISOString(),
      provider: published.provider,
      clinic: published.clinic,
      widgetOrigins: published.widgetOrigins ?? [],
    });

    await this.audit.recordEvent({
      tenantId: row.tenantId,
      actorId: user.userId,
      clinicId: row.clinicId,
      action: "marketplace.profile.updated",
      resource: "MarketplaceListing",
      resourceId: listingId,
      metadata: { completenessPercent: published.completenessPercent },
    });

    await this.listings.recomputeListing(listingId);
    return this.buildEditorDto({ ...updated, profileJson: next });
  }

  async uploadPhoto(
    user: JwtUser,
    listingId: string,
    file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<ProviderProfileEditorDto> {
    const row = await this.loadListingForTenant(user, listingId);
    if (!file?.buffer?.length) throw new BadRequestException("File required");
    if (file.size > 8 * 1024 * 1024) throw new BadRequestException("Max 8MB");
    const relativePath = `${row.tenantId}/${row.clinicId}/${row.clinicianId}/${randomUUID()}-${path.basename(file.originalname)}`;
    await this.uploads.put("marketplace-profiles", relativePath, file.buffer, file.mimetype || "image/jpeg");
    const prev = parseProviderProfileJson(row.profileJson);
    const next = { ...prev, photoRelativePath: relativePath, photoOriginalName: file.originalname };
    await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { profileJson: next as Prisma.InputJsonValue },
    });
    await this.listings.recomputeListing(listingId);
    const refreshed = await this.prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } });
    return this.buildEditorDto(refreshed);
  }

  async listProvidersForKiorex(query: {
    updatedSince?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: PublishedProviderDto[]; page: number; pageSize: number; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.MarketplaceListingWhereInput = {
      status: { in: [ListingStatus.LIVE, ListingStatus.PAUSED] },
    };
    if (query.updatedSince) {
      const since = new Date(query.updatedSince);
      if (!Number.isNaN(since.getTime())) where.updatedAt = { gte: since };
    }
    const [total, rows] = await Promise.all([
      this.prisma.marketplaceListing.count({ where }),
      this.prisma.marketplaceListing.findMany({
        where,
        orderBy: { updatedAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const items = await Promise.all(rows.map((r) => this.buildPublishedFromRow(r)));
    return { items, page, pageSize, total };
  }

  async completenessForListing(row: {
    profileJson: unknown;
    clinicId: string;
    tenantId: string;
  }): Promise<number> {
    const profile = parseProviderProfileJson(row.profileJson);
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: row.clinicId },
      select: { latitude: true, longitude: true, addressEn: true, addressAr: true },
    });
    const feeCount = await this.prisma.appointmentType.count({
      where: {
        tenantId: row.tenantId,
        marketplaceBookable: true,
        isActive: true,
        OR: [{ clinicId: row.clinicId }, { clinicId: null }],
      },
    });
    return providerProfileCompletenessPercent({
      profile,
      hasMarketplaceFees: feeCount > 0,
      clinicHasGeo: clinic?.latitude != null && clinic?.longitude != null,
      clinicHasAddress: Boolean(clinic?.addressEn?.trim() && clinic?.addressAr?.trim()),
    });
  }

  /** GRW-P1-D1: allowed widget origins of the clinic, empty while the widget is disabled. */
  private async widgetOriginsFor(clinicId: string): Promise<string[]> {
    const cfg = await this.prisma.bookingWidgetConfig.findUnique({ where: { clinicId }, select: { enabled: true, allowedOrigins: true } });
    if (!cfg?.enabled || !Array.isArray(cfg.allowedOrigins)) return [];
    return (cfg.allowedOrigins as unknown[]).filter((o): o is string => typeof o === "string");
  }

  /** GRW-P1-D1: widget settings changed -> Kiorex gets a PROVIDER_PROFILE_UPDATED (with widgetOrigins) for every published listing of the clinic. Returns how many were queued. */
  async republishClinicProfiles(tenantId: string, clinicId: string): Promise<number> {
    const rows = await this.prisma.marketplaceListing.findMany({
      where: { tenantId, clinicId, status: { in: [ListingStatus.LIVE, ListingStatus.PAUSED] } },
    });
    for (const row of rows) {
      const published = await this.buildPublishedFromRow(row);
      await this.outbox.enqueue(tenantId, PROVIDER_PROFILE_UPDATED_TOPIC, {
        listingId: row.id,
        clinicId: row.clinicId,
        clinicianId: row.clinicianId,
        status: row.status,
        completenessPercent: published.completenessPercent,
        updatedAt: new Date().toISOString(),
        provider: published.provider,
        clinic: published.clinic,
        widgetOrigins: published.widgetOrigins ?? [],
      });
    }
    return rows.length;
  }

  private async buildPublishedFromRow(
    row: Prisma.MarketplaceListingGetPayload<object>,
  ): Promise<PublishedProviderDto> {
    const profile = parseProviderProfileJson(row.profileJson);
    const [clinic, types, payers] = await Promise.all([
      this.prisma.clinic.findUniqueOrThrow({
        where: { id: row.clinicId },
        select: {
          nameEn: true,
          nameAr: true,
          addressEn: true,
          addressAr: true,
          latitude: true,
          longitude: true,
          phone: true,
          logoUrl: true,
          clinicalSpecialty: true,
          defaultCurrency: true,
          bookingSlug: true,
        },
      }),
      this.prisma.appointmentType.findMany({
        where: {
          tenantId: row.tenantId,
          marketplaceBookable: true,
          isActive: true,
          OR: [{ clinicId: row.clinicId }, { clinicId: null }],
        },
        select: { id: true, nameEn: true, nameAr: true, feeAmount: true, depositAmount: true, serviceLocation: true, homeSurchargeAmount: true },
      }),
      profile.acceptedPayerIds?.length
        ? this.prisma.payerCompany.findMany({
            where: { tenantId: row.tenantId, id: { in: profile.acceptedPayerIds }, active: true },
            select: { id: true, nameEn: true, nameAr: true },
          })
        : Promise.resolve([]),
    ]);

    const completenessPercent = await this.completenessForListing(row);
    const widgetOrigins = await this.widgetOriginsFor(row.clinicId);
    // HOME is offered only while clinic.home_visits is effective and the clinician takes home visits ("Home visit types hidden for new bookings").
    const v23 = await this.v23Fields(row.tenantId, row.clinicianId, types.map((t) => t.serviceLocation));
    const offered = types.filter((t) => (t.serviceLocation !== "HOME" || v23.homeOffered) && (t.serviceLocation !== "VIDEO" || v23.telehealthOffered));
    const fees = offered.map((t) => publishedFee(t, profile.feesByAppointmentTypeId?.[t.id], clinic.defaultCurrency));

    return {
      ...v23.fields,
      widgetOrigins,
      listingId: row.id,
      tenantId: row.tenantId,
      clinicId: row.clinicId,
      clinicianId: row.clinicianId,
      status: row.status,
      completenessPercent,
      updatedAt: row.updatedAt.toISOString(),
      provider: {
        ...profile,
        fees,
        payers,
      },
      clinic: {
        nameEn: clinic.nameEn,
        nameAr: clinic.nameAr,
        addressEn: clinic.addressEn,
        addressAr: clinic.addressAr,
        latitude: clinic.latitude != null ? Number(clinic.latitude) : null,
        longitude: clinic.longitude != null ? Number(clinic.longitude) : null,
        phone: clinic.phone,
        logoUrl: clinic.logoUrl,
        bookingSlug: clinic.bookingSlug, // GRW-P1-G: lets Kiorex resolve the widget embed slug to this clinic
        clinicalSpecialty: clinic.clinicalSpecialty,
        parking: Boolean(profile.parking),
        wheelchairAccess: Boolean(profile.wheelchairAccess),
        amenities: profile.amenities ?? [],
        photos: profile.clinicPhotoRelativePaths ?? [],
      },
    };
  }

  private async v23Fields(tenantId: string, clinicianId: string, typeLocations: string[]) {
    const hasHomeTypes = typeLocations.includes("HOME");
    const [tenant, user, settings] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { edition: true, nurseTenantKind: true, market: { select: { code: true, clinicalConfig: true } } } }),
      this.prisma.user.findUnique({ where: { id: clinicianId }, select: { profession: true, role: true, additionalRoles: true } }),
      this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId } } }),
    ]);
    const profession = user ? effectiveProfession(user) : null;
    const homeFlag = this.flags ? (await this.flags.evaluate(tenantId, "clinic.home_visits")).effective : false;
    const homeOffered = Boolean(hasHomeTypes && homeFlag && settings?.acceptsHomeVisits);
    const hasVideoTypes = typeLocations.includes("VIDEO");
    // ADR-039: VIDEO is offered only while flag + entitlement are on AND the doctor switched "Offers telehealth" on.
    const telehealthOffered = hasVideoTypes && (await telehealthOfferedBy({ prisma: this.prisma as never, flags: this.flags, entitlements: this.entitlements }, tenantId, clinicianId));
    const pack = resolveProfessionPack(tenant?.market);
    const register = profession ? pack.verification[profession]?.registers.find((r) => r.isSyndicate)?.code : undefined;
    const fields: Pick<PublishedProviderDto, "profession" | "edition" | "serviceLocations" | "modalities" | "coverageDistricts" | "verification" | "assignsClinician"> = {
      ...(profession ? { profession } : {}),
      edition: tenant?.edition ?? "CLINIC",
      serviceLocations: [...(typeLocations.some((l) => l !== "HOME" && l !== "VIDEO") || typeLocations.length === 0 ? (["IN_CLINIC"] as const) : []), ...(homeOffered ? (["HOME"] as const) : []), ...(telehealthOffered ? (["VIDEO"] as const) : [])],
      modalities: modalitiesOf(typeLocations.some((l) => l !== "HOME" && l !== "VIDEO") || typeLocations.length === 0, homeOffered, telehealthOffered),
      coverageDistricts: homeOffered ? settings?.coverageDistrictIds ?? [] : [],
      ...(register ? { verification: { register } } : {}),
      ...(tenant?.nurseTenantKind === "AGENCY" ? { assignsClinician: true } : {}),
    };
    return { fields, homeOffered, telehealthOffered };
  }

  private async buildEditorDto(row: Prisma.MarketplaceListingGetPayload<object>): Promise<ProviderProfileEditorDto> {
    const preview = await this.buildPublishedFromRow(row);
    const clinic = await this.prisma.clinic.findUniqueOrThrow({ where: { id: row.clinicId } });
    const types = await this.prisma.appointmentType.findMany({
      where: {
        tenantId: row.tenantId,
        marketplaceBookable: true,
        isActive: true,
        OR: [{ clinicId: row.clinicId }, { clinicId: null }],
      },
      select: { id: true, nameEn: true, nameAr: true, feeAmount: true },
    });
    const payers = await this.prisma.payerCompany.findMany({
      where: { tenantId: row.tenantId, active: true },
      select: { id: true, nameEn: true, nameAr: true },
      take: 200,
    });
    return {
      listingId: row.id,
      clinicId: row.clinicId,
      clinicianId: row.clinicianId,
      status: row.status,
      profile: parseProviderProfileJson(row.profileJson),
      completenessPercent: preview.completenessPercent,
      clinic: {
        nameEn: clinic.nameEn,
        nameAr: clinic.nameAr,
        addressEn: clinic.addressEn,
        addressAr: clinic.addressAr,
        latitude: clinic.latitude != null ? String(clinic.latitude) : null,
        longitude: clinic.longitude != null ? String(clinic.longitude) : null,
        phone: clinic.phone,
        logoUrl: clinic.logoUrl,
        clinicalSpecialty: clinic.clinicalSpecialty,
      },
      fees: types.map((t) => ({
        appointmentTypeId: t.id,
        nameEn: t.nameEn,
        nameAr: t.nameAr,
        feeAmount: String(t.feeAmount),
        currency: clinic.defaultCurrency,
      })),
      payers,
      preview,
    };
  }

  private async loadListingForTenant(user: JwtUser, listingId: string) {
    const row = await this.prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!row) throw new NotFoundException("Listing not found");
    this.listings.assertClinicManage(user, row.tenantId);
    if (user.tenantId !== row.tenantId) throw new NotFoundException("Listing not found");
    return row;
  }

  private async requestVerificationRereview(tenantId: string, clinicianId: string, actorId: string) {
    const verification = await this.prisma.clinicianVerification.findUnique({ where: { userId: clinicianId } });
    if (!verification || verification.status !== VerificationStatus.VERIFIED) return;
    await this.prisma.clinicianVerification.update({
      where: { userId: clinicianId },
      data: {
        status: VerificationStatus.PENDING,
        pendingAt: new Date(),
        reviewedAt: null,
        reviewer: { disconnect: true },
      },
    });
    await this.audit.recordEvent({
      tenantId,
      actorId,
      clinicId: null,
      action: "clinician.verification.rereview_requested",
      resource: "ClinicianVerification",
      resourceId: verification.id,
      metadata: { reason: "marketplace_profile_name_or_specialty" },
    });
  }
}