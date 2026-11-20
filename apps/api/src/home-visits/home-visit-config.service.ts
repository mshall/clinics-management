import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Gender, Prisma, ServiceLocation, UserRole } from "@prisma/client";
import { normalizeDistrictId } from "@kiorly/field-visit";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { hasAnyRole } from "../common/effective-roles";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { districtsFromMarket } from "../field-visit/field-visit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ScopeOfPracticeService } from "../scope-of-practice/scope-of-practice.service";
import { DEFAULT_HOME_TRAVEL_BUFFER_MIN, parseHomeHours } from "./home-visit-rules";

export const HOME_VISITS_FLAG = "clinic.home_visits";
export const HOME_ROUTE_VIEW_FLAG = "clinic.home_route_view";
export const HOME_DISPATCH_FLAG = "clinic.home_dispatch";

/** Org-level managers (and, in the Nurse edition, dispatchers: front-desk roles) may configure other clinicians. */
const MANAGER_ROLES: readonly UserRole[] = [UserRole.CLINIC_ADMIN, UserRole.GROUP_ADMIN, UserRole.BRANCH_MANAGER];
const DISPATCHER_ROLES: readonly UserRole[] = [...MANAGER_ROLES, UserRole.RECEPTIONIST, UserRole.CALL_CENTER];

export const isHomeVisitManager = (u: Pick<JwtUser, "role" | "additionalRoles" | "isTenantOwner">) =>
  Boolean(u.isTenantOwner) || hasAnyRole(u, MANAGER_ROLES);
export const isHomeVisitDispatcher = (u: Pick<JwtUser, "role" | "additionalRoles" | "isTenantOwner">) =>
  Boolean(u.isTenantOwner) || hasAnyRole(u, DISPATCHER_ROLES);

export type HomeSettingsInput = {
  acceptsHomeVisits?: boolean;
  coverageDistrictIds?: string[];
  maxTravelMinutes?: number | null;
  startDistrictId?: string | null;
  dailyVisitCap?: number | null;
  homeHours?: unknown;
  restrictToPatientGender?: "M" | "F" | null;
};

export type HomeTypeInput = {
  serviceLocation: "IN_CLINIC" | "HOME";
  durationMinutes?: number;
  travelBufferBeforeMin?: number;
  travelBufferAfterMin?: number;
  homeSurchargeAmount?: number | null;
  depositAmount?: number | null;
  marketplaceBookable?: boolean;
};

@Injectable()
export class HomeVisitConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly scope: ScopeOfPracticeService,
    private readonly audit: AuditService,
  ) {}

  /** HVCFG02/03 + HVBK06 — read one clinician's home settings (defaults when none saved). */
  async getSettings(tenantId: string, clinicianId: string) {
    const row = await this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId } } });
    return this.view(clinicianId, row);
  }

  private view(clinicianId: string, row: Awaited<ReturnType<PrismaService["clinicianHomeSettings"]["findUnique"]>>) {
    return {
      clinicianId,
      acceptsHomeVisits: row?.acceptsHomeVisits ?? false,
      coverageDistrictIds: row?.coverageDistrictIds ?? [],
      maxTravelMinutes: row?.maxTravelMinutes ?? null,
      startDistrictId: row?.startDistrictId ?? null,
      dailyVisitCap: row?.dailyVisitCap ?? null,
      homeHours: row?.homeHoursJson ?? null,
      restrictToPatientGender: row?.restrictToPatientGender ?? null,
    };
  }

  async upsertSettings(tenantId: string, actor: JwtUser, clinicianId: string, input: HomeSettingsInput) {
    const self = actor.userId === clinicianId;
    if (!self && !isHomeVisitManager(actor)) throw new ForbiddenException("Only the clinician or an organization manager can change home-visit settings");
    const clinician = await this.prisma.user.findFirst({ where: { id: clinicianId, tenantId }, select: { id: true } });
    if (!clinician) throw new NotFoundException("Clinician not found");

    const existing = await this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId } } });
    const enabling = input.acceptsHomeVisits === true && !(existing?.acceptsHomeVisits);
    if (enabling) {
      // Turning on a NEW home-visit capability is gated (launch-locked); changing existing settings is not.
      await requireFeature(this.flags, tenantId, HOME_VISITS_FLAG);
      // Scope of practice is a safety control (ADR-025): dentists have no home visits at launch.
      await this.scope.assertCan(clinicianId, "home_visits.perform");
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { clinicalConfig: true } } } });
    const known = new Set(districtsFromMarket(tenant?.market).map((d) => d.id));

    const data: Prisma.ClinicianHomeSettingsUncheckedUpdateInput = {};
    if (input.acceptsHomeVisits !== undefined) data.acceptsHomeVisits = input.acceptsHomeVisits;
    if (input.coverageDistrictIds !== undefined) {
      const ids = [...new Set(input.coverageDistrictIds.map((d) => normalizeDistrictId(String(d))).filter(Boolean))];
      const unknown = known.size ? ids.filter((d) => !known.has(d)) : [];
      if (unknown.length) throw new BadRequestException({ code: "UNKNOWN_DISTRICT", message: "District is not in the market pack", districts: unknown });
      data.coverageDistrictIds = ids;
    }
    if (input.startDistrictId !== undefined) data.startDistrictId = input.startDistrictId ? normalizeDistrictId(input.startDistrictId) : null;
    if (input.maxTravelMinutes !== undefined) {
      if (input.maxTravelMinutes != null && (!Number.isInteger(input.maxTravelMinutes) || input.maxTravelMinutes < 5 || input.maxTravelMinutes > 240)) {
        throw new BadRequestException("maxTravelMinutes must be 5..240");
      }
      data.maxTravelMinutes = input.maxTravelMinutes;
    }
    if (input.dailyVisitCap !== undefined) {
      if (input.dailyVisitCap != null && (!Number.isInteger(input.dailyVisitCap) || input.dailyVisitCap < 1 || input.dailyVisitCap > 50)) {
        throw new BadRequestException("dailyVisitCap must be 1..50");
      }
      data.dailyVisitCap = input.dailyVisitCap;
    }
    if (input.homeHours !== undefined) {
      try {
        data.homeHoursJson = (parseHomeHours(input.homeHours) ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull;
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : "Invalid homeHours");
      }
    }
    if (input.restrictToPatientGender !== undefined) {
      if (input.restrictToPatientGender != null && input.restrictToPatientGender !== "M" && input.restrictToPatientGender !== "F") {
        throw new BadRequestException("restrictToPatientGender must be M, F or null");
      }
      // BR60: clinician-owned. A manager may not impose it on someone else.
      if (!self && input.restrictToPatientGender != null) throw new ForbiddenException("Only the clinician sets their own patient-gender restriction");
      data.restrictToPatientGender = (input.restrictToPatientGender as Gender | null) ?? null;
    }
    const maxTravel = (data.maxTravelMinutes as number | null | undefined) ?? existing?.maxTravelMinutes;
    const start = (data.startDistrictId as string | null | undefined) ?? existing?.startDistrictId;
    if (maxTravel != null && !start) throw new BadRequestException("startDistrictId is required with maxTravelMinutes");

    const row = await this.prisma.clinicianHomeSettings.upsert({
      where: { tenantId_clinicianId: { tenantId, clinicianId } },
      create: { ...(data as Prisma.ClinicianHomeSettingsUncheckedCreateInput), tenantId, clinicianId },
      update: data,
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: actor.userId,
      clinicId: null,
      action: "home_visit.settings.updated",
      resource: "ClinicianHomeSettings",
      resourceId: row.id,
      metadata: { clinicianId, fields: Object.keys(data) },
    });
    return this.view(clinicianId, row);
  }

  /** HVCFG01 — mark a visit type IN_CLINIC or HOME and set duration, travel buffers (default 30/30), home surcharge and deposit. */
  async configureType(tenantId: string, actor: JwtUser, typeId: string, input: HomeTypeInput) {
    if (!isHomeVisitManager(actor)) throw new ForbiddenException("Only organization managers configure visit types");
    const type = await this.prisma.appointmentType.findFirst({ where: { id: typeId, tenantId } });
    if (!type) throw new NotFoundException("Appointment type not found");
    if (input.serviceLocation !== "IN_CLINIC" && input.serviceLocation !== "HOME") throw new BadRequestException("serviceLocation must be IN_CLINIC or HOME");

    const data: Prisma.AppointmentTypeUncheckedUpdateInput = { serviceLocation: input.serviceLocation as ServiceLocation };
    const num = (v: unknown, name: string, min: number, max: number) => {
      if (v == null) return undefined;
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new BadRequestException(`${name} must be ${min}..${max}`);
      return v;
    };
    if (input.serviceLocation === "HOME") {
      // New HOME visit types are a launch-locked capability; existing booked visits are honoured regardless.
      if (type.serviceLocation !== ServiceLocation.HOME) await requireFeature(this.flags, tenantId, HOME_VISITS_FLAG);
      const duration = num(input.durationMinutes, "durationMinutes", 5, 480);
      if (duration !== undefined) data.durationMinutes = duration;
      data.bufferBeforeMin = num(input.travelBufferBeforeMin, "travelBufferBeforeMin", 0, 180) ?? (type.serviceLocation === ServiceLocation.HOME ? type.bufferBeforeMin : DEFAULT_HOME_TRAVEL_BUFFER_MIN);
      data.bufferAfterMin = num(input.travelBufferAfterMin, "travelBufferAfterMin", 0, 180) ?? (type.serviceLocation === ServiceLocation.HOME ? type.bufferAfterMin : DEFAULT_HOME_TRAVEL_BUFFER_MIN);
      const sur = num(input.homeSurchargeAmount, "homeSurchargeAmount", 0, 100000);
      if (input.homeSurchargeAmount !== undefined) data.homeSurchargeAmount = sur == null ? null : new Prisma.Decimal(sur);
      if (input.depositAmount !== undefined) data.depositAmount = input.depositAmount == null ? null : new Prisma.Decimal(num(input.depositAmount, "depositAmount", 0, 1000000)!);
    } else {
      data.homeSurchargeAmount = null;
    }
    if (input.marketplaceBookable !== undefined) data.marketplaceBookable = input.marketplaceBookable;
    const row = await this.prisma.appointmentType.update({ where: { id: typeId }, data });
    await this.audit.recordEvent({
      tenantId,
      actorId: actor.userId,
      clinicId: row.clinicId,
      action: "home_visit.type.configured",
      resource: "AppointmentType",
      resourceId: row.id,
      metadata: { serviceLocation: row.serviceLocation },
    });
    return {
      id: row.id,
      serviceLocation: row.serviceLocation,
      durationMinutes: row.durationMinutes,
      travelBufferBeforeMin: row.bufferBeforeMin,
      travelBufferAfterMin: row.bufferAfterMin,
      homeSurchargeAmount: row.homeSurchargeAmount?.toString() ?? null,
      depositAmount: row.depositAmount?.toString() ?? null,
      marketplaceBookable: row.marketplaceBookable,
    };
  }

  /** Organization safety contact (HVSAF01, BR53). Owners/managers only; needed before the first home visit starts. */
  async setSafetyContact(tenantId: string, actor: JwtUser, input: { name: string; phone: string }) {
    if (!isHomeVisitManager(actor)) throw new ForbiddenException("Only organization managers set the safety contact");
    const phone = input.phone?.trim();
    const name = input.name?.trim();
    if (!name || !phone || phone.replace(/\D/g, "").length < 8) throw new BadRequestException("name and a valid phone are required");
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { safetyContactName: name, safetyContactPhone: phone } });
    await this.audit.recordEvent({
      tenantId,
      actorId: actor.userId,
      clinicId: null,
      action: "home_visit.safety_contact.updated",
      resource: "Tenant",
      resourceId: tenantId,
    });
    return { name, configured: true };
  }

  async getSafetyContact(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { safetyContactName: true, safetyContactPhone: true } });
    return { name: t?.safetyContactName ?? null, configured: Boolean(t?.safetyContactPhone) };
  }
}
