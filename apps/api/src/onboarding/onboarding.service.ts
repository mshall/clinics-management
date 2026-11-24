import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Prisma, UserRole, VerificationStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { entitlementTruthy } from "../entitlements/entitlement-value";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ONBOARDING_STEP_KEYS,
  SKIPPED_STEP_VALUE,
  isCr01ActivationMet,
  type OnboardingStepKey,
  type OnboardingStepsJson,
} from "./onboarding-steps";
import {
  SETUP_DEFS,
  SETUP_SKIPPED,
  buildSetupPlan,
  canPerformStep,
  requiredUnitsDone,
  skipKey,
  type SetupClinicSnap,
  type SetupPlanDto,
  type SetupRole,
  type SetupSnapshot,
  type SetupStepDto,
  type SetupViewer,
} from "./onboarding-plan";

export type OnboardingStepDto = SetupStepDto & {
  /** Legacy fields kept for older clients. */
  completedAt: string | null;
};

export type OnboardingProgressDto = SetupPlanDto & {
  steps: OnboardingStepDto[];
  completedAt: string | null;
  activatedAt: string | null;
  activationJustAchieved: boolean;
  celebrateActivation: boolean;
  primaryClinicId: string | null;
  edition: "CLINIC" | "NURSE";
  /** Set when the owner dismissed the completed checklist; ignored (null) as soon as new pending work appears. */
  dismissedAt: string | null;
  /** Clinics the plan was computed for (id + names) so the UI can label entities. */
  entityCount: number;
};

const DISMISSED_KEY = "_dismissedAt";

function parseStepsJson(raw: unknown): OnboardingStepsJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OnboardingStepsJson = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

const ROLE_MAP: Partial<Record<UserRole, SetupRole>> = {
  GROUP_ADMIN: "group_admin",
  CLINIC_ADMIN: "clinic_admin",
  BRANCH_MANAGER: "branch_manager",
  PHYSICIAN: "physician",
  NURSE: "nurse",
  RECEPTIONIST: "receptionist",
  CALL_CENTER: "call_center",
  FINANCE_OFFICER: "finance_officer",
  HR_OFFICER: "hr_officer",
};

export function viewerFromUser(user: Pick<JwtUser, "role" | "additionalRoles" | "isTenantOwner">): SetupViewer {
  const roles = [user.role, ...(user.additionalRoles ?? [])]
    .map((r) => ROLE_MAP[r])
    .filter((r): r is SetupRole => Boolean(r));
  return { isOwner: Boolean(user.isTenantOwner), roles };
}

const CONFIGURED_SLACK_MS = 2000;

@Injectable()
export class OnboardingService {
  private readonly entitlements: EntitlementsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.entitlements = new EntitlementsService(prisma);
  }

  /** Re-evaluates every step from real data on each call (no sticky "done"): the checklist always matches the data. */
  async getOrCreate(tenantId: string, viewer: SetupViewer = { isOwner: true, roles: [] }, userId?: string): Promise<OnboardingProgressDto> {
    let row = await this.prisma.onboardingProgress.findUnique({ where: { tenantId } });
    if (!row) {
      row = await this.prisma.onboardingProgress.create({ data: { tenantId, stepsJson: {} } });
    }
    const existing = parseStepsJson(row.stepsJson);
    const snap = await this.loadSnapshot(tenantId, userId);
    const empty = !snap;
    const plan = buildSetupPlan(
      snap ?? this.emptySnapshot(),
      existing,
      viewer,
    );

    // first-completion timestamps for org-level steps (analytics + activation); never retracted
    const stamped: OnboardingStepsJson = { ...existing };
    const now = new Date().toISOString();
    for (const st of plan.steps) {
      if (st.scope === "org" && st.status === "done" && !stamped[st.key]) stamped[st.key] = now;
      if (st.scope === "clinic" && st.status === "done" && !stamped[st.key]) stamped[st.key] = now;
    }

    const wasActivated = Boolean(row.activatedAt);
    const cr01Now = isCr01ActivationMet(stamped);
    let activatedAt = row.activatedAt;
    let activationJustAchieved = false;
    if (cr01Now && !wasActivated) {
      activatedAt = new Date();
      activationJustAchieved = true;
      await this.audit.recordEvent({
        tenantId,
        actorId: null,
        clinicId: snap?.clinics[0]?.id ?? null,
        action: "TENANT_ACTIVATED",
        resource: "Onboarding",
        resourceId: tenantId,
        metadata: { rule: "CR-01", steps: { first_appointment: stamped.first_appointment, first_check_in: stamped.first_check_in } },
      });
    }

    const requiredAllDone = requiredUnitsDone(plan) && !empty;
    const completedAt = requiredAllDone ? row.completedAt ?? new Date() : null;
    // new pending work reopens a dismissed checklist
    if (existing[DISMISSED_KEY] && !plan.allDone) delete stamped[DISMISSED_KEY];

    if (JSON.stringify(stamped) !== JSON.stringify(existing) || activationJustAchieved || (requiredAllDone && !row.completedAt) || (!requiredAllDone && row.completedAt)) {
      row = await this.prisma.onboardingProgress.update({
        where: { tenantId },
        data: { stepsJson: stamped as unknown as Prisma.InputJsonValue, activatedAt, completedAt },
      });
    }

    return {
      ...plan,
      steps: plan.steps.map((s) => ({ ...s, completedAt: s.completedAt ?? stamped[s.key] ?? null })).map((s) => ({ ...s, completedAt: s.status === "done" && s.completedAt !== SKIPPED_STEP_VALUE ? s.completedAt : null })),
      completedAt: row.completedAt?.toISOString() ?? null,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      activationJustAchieved,
      celebrateActivation: Boolean(row.activatedAt),
      primaryClinicId: snap?.clinics[0]?.id ?? null,
      edition: snap?.edition ?? "CLINIC",
      dismissedAt: plan.allDone && stamped[DISMISSED_KEY] ? stamped[DISMISSED_KEY]! : null,
      entityCount: snap?.clinics.length ?? 0,
    };
  }

  async patchStep(
    tenantId: string,
    actorId: string,
    key: string,
    action: "complete" | "skip",
    entityId?: string,
    viewer: SetupViewer = { isOwner: true, roles: [] },
  ): Promise<OnboardingProgressDto> {
    const def = SETUP_DEFS.find((d) => d.key === key);
    if (!def || !ONBOARDING_STEP_KEYS.includes(key as OnboardingStepKey)) {
      throw new NotFoundException("Unknown onboarding step");
    }
    if (action === "complete") {
      throw new BadRequestException("This step completes automatically when the work is done; it cannot be ticked by hand");
    }
    if (def.required) throw new BadRequestException("Required steps cannot be skipped");
    if (!canPerformStep(def, viewer)) throw new ForbiddenException("Your role cannot change this step; ask the owner");
    if (def.scope === "clinic") {
      if (!entityId) throw new BadRequestException("entityId (clinic) is required for a per-clinic step");
      const clinic = await this.prisma.clinic.findFirst({ where: { id: entityId, tenantId }, select: { id: true } });
      if (!clinic) throw new NotFoundException("Clinic not found");
    }

    await this.getOrCreate(tenantId, viewer, actorId);
    const row = await this.prisma.onboardingProgress.findUniqueOrThrow({ where: { tenantId } });
    const steps = parseStepsJson(row.stepsJson);
    steps[skipKey(key, def.scope === "clinic" ? entityId : null)] = SETUP_SKIPPED;

    await this.audit.recordEvent({
      tenantId,
      actorId,
      clinicId: def.scope === "clinic" ? entityId ?? null : null,
      action: "ONBOARDING_STEP_SKIPPED",
      resource: "Onboarding",
      resourceId: key,
      metadata: { step: key, entityId: entityId ?? null },
    });
    await this.prisma.onboardingProgress.update({
      where: { tenantId },
      data: { stepsJson: steps as unknown as Prisma.InputJsonValue },
    });
    return this.getOrCreate(tenantId, viewer, actorId);
  }

  /** Dismiss the completed checklist for the whole organisation (remembered server-side). Refused while work is pending. */
  async dismiss(tenantId: string, actorId: string, viewer: SetupViewer): Promise<OnboardingProgressDto> {
    const cur = await this.getOrCreate(tenantId, viewer, actorId);
    if (!cur.allDone) throw new BadRequestException("The checklist can be dismissed once every step is done or skipped");
    const row = await this.prisma.onboardingProgress.findUniqueOrThrow({ where: { tenantId } });
    const steps = parseStepsJson(row.stepsJson);
    steps[DISMISSED_KEY] = new Date().toISOString();
    await this.prisma.onboardingProgress.update({ where: { tenantId }, data: { stepsJson: steps as unknown as Prisma.InputJsonValue } });
    return this.getOrCreate(tenantId, viewer, actorId);
  }

  private emptySnapshot(): SetupSnapshot {
    return {
      edition: "CLINIC", nurseKind: null, planKey: "LITE", whatsAppEntitled: false, clinics: [], whatsAppRemindersEnabled: false,
      staffInvited: false, patientCount: 0, appointmentCount: 0, checkedInCount: 0, doctorVerified: false, kiorexConnectStatus: null,
      nurse: { verified: false, zones: false, services: false, prices: false, availability: false, safetyContact: false },
    };
  }

  async loadSnapshot(tenantId: string, userId?: string): Promise<SetupSnapshot | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        edition: true,
        nurseTenantKind: true,
        whatsAppRemindersEnabled: true,
        safetyContactPhone: true,
        providerSettings: true,
        clinics: {
          where: { disabledAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true, nameEn: true, nameAr: true, logoUrl: true, invoiceLogoRelativePath: true, licenseNumber: true,
            openingTime: true, closingTime: true, providerSettings: true, createdAt: true,
          },
        },
      },
    });
    if (!tenant) return null;
    const clinicIds = tenant.clinics.map((c) => c.id);
    const physicianWhere = { OR: [{ role: UserRole.PHYSICIAN }, { additionalRoles: { has: UserRole.PHYSICIAN } }] };
    const [checkInAppt, types, templates, staffCount, openInvites, patientCount, appointmentCount, checkedInCount, listingTypes, verifiedPhysicians, ents, myVerification, homeSettings, homeTypes, referralLinkCount] =
      await Promise.all([
        this.prisma.appointment.findFirst({ where: { tenantId, patient: { isSample: false }, status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] } }, orderBy: { startsAt: "asc" }, select: { id: true } }),
        this.prisma.appointmentType.findMany({ where: { tenantId, isActive: true }, select: { clinicId: true, createdAt: true, updatedAt: true, feeAmount: true, serviceLocation: true, marketplaceBookable: true } }),
        this.prisma.clinicianAvailabilityTemplate.findMany({ where: { tenantId }, select: { clinicId: true, clinicianId: true, createdAt: true, updatedAt: true } }),
        this.prisma.user.count({
          where: { tenantId, deletedAt: null, OR: [{ role: UserRole.RECEPTIONIST }, { role: UserRole.CALL_CENTER }, { additionalRoles: { has: UserRole.RECEPTIONIST } }, { additionalRoles: { has: UserRole.CALL_CENTER } }] },
        }),
        this.prisma.invitation.count({ where: { tenantId, revokedAt: null } }),
        this.prisma.patient.count({ where: { tenantId, isSample: false } }),
        this.prisma.appointment.count({ where: { tenantId, patient: { isSample: false } } }),
        this.prisma.appointment.count({ where: { tenantId, status: AppointmentStatus.CHECKED_IN, patient: { isSample: false } } }),
        this.prisma.appointmentType.findMany({ where: { tenantId, marketplaceBookable: true, isActive: true }, select: { clinicId: true } }),
        this.prisma.clinicianVerification.count({ where: { tenantId, status: VerificationStatus.VERIFIED, user: physicianWhere } }),
        this.entitlements.resolve(tenantId),
        userId ? this.prisma.clinicianVerification.findUnique({ where: { userId }, select: { status: true } }) : Promise.resolve(null),
        userId ? this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId: userId } }, select: { coverageDistrictIds: true } }) : Promise.resolve(null),
        this.prisma.appointmentType.findMany({ where: { tenantId, isActive: true, serviceLocation: "HOME" }, select: { feeAmount: true } }),
        this.prisma.providerReferralLink.count({ where: { tenantId, status: { not: "REVOKED" } } }),
      ]);

    // "configured" = the owner edited a type (fee, duration...) or added one after the clinic was created; signup seeds alone do not count.
    const configured = (rows: { createdAt: Date; updatedAt: Date }[], clinicCreatedAt: Date) =>
      rows.some(
        (r) =>
          r.updatedAt.getTime() > r.createdAt.getTime() + CONFIGURED_SLACK_MS ||
          r.createdAt.getTime() > clinicCreatedAt.getTime() + 10_000,
      );
    const clinics: SetupClinicSnap[] = tenant.clinics.map((c) => {
      const own = types.filter((t) => t.clinicId === c.id || t.clinicId === null);
      const tpl = templates.filter((t) => t.clinicId === c.id);
      const ps = (c.providerSettings ?? {}) as {
        setupHoursConfirmedAt?: string;
        kiorexExcludedFromMarketplace?: boolean;
      };
      const hasListingType = listingTypes.some((t) => t.clinicId === c.id || t.clinicId === null);
      return {
        id: c.id,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        logoUrl: c.logoUrl,
        hasInvoiceLogo: Boolean(c.invoiceLogoRelativePath),
        licenseNumber: c.licenseNumber,
        openingTime: c.openingTime,
        closingTime: c.closingTime,
        hoursConfirmed: Boolean(ps.setupHoursConfirmedAt),
        appointmentTypesConfigured: configured(own, c.createdAt),
        availabilityConfigured: tpl.some((t) => t.updatedAt.getTime() > t.createdAt.getTime() + CONFIGURED_SLACK_MS),
        kiorexListingReady: hasListingType && verifiedPhysicians > 0,
        kiorexExcludedFromMarketplace: Boolean(ps.kiorexExcludedFromMarketplace),
      };
    });
    void clinicIds;
    const connect = (tenant.providerSettings as { kiorexConnect?: { status?: string } } | null)?.kiorexConnect;
    const planKey = String(ents.plan.key);
    return {
      edition: tenant.edition === "NURSE" ? "NURSE" : "CLINIC",
      nurseKind: tenant.nurseTenantKind === "AGENCY" ? "AGENCY" : tenant.nurseTenantKind === "SOLO" ? "SOLO" : null,
      planKey,
      whatsAppEntitled: entitlementTruthy(ents.entitlements.whatsapp_reminders),
      clinics,
      whatsAppRemindersEnabled: tenant.whatsAppRemindersEnabled,
      staffInvited: staffCount > 0 || openInvites > 0,
      patientCount,
      appointmentCount,
      checkedInCount,
      checkInAppointmentId: checkInAppt?.id ?? null,
      doctorVerified: verifiedPhysicians > 0,
      kiorexConnectStatus: connect?.status ?? null,
      referralLinkCount,
      nurse: {
        verified: myVerification?.status === VerificationStatus.VERIFIED,
        zones: (homeSettings?.coverageDistrictIds.length ?? 0) > 0,
        services: homeTypes.length > 0,
        prices: homeTypes.length > 0 && homeTypes.every((t) => Number(t.feeAmount) > 0),
        availability: templates.some((t) => t.clinicianId === userId && t.updatedAt.getTime() > t.createdAt.getTime() + CONFIGURED_SLACK_MS),
        safetyContact: Boolean(tenant.safetyContactPhone),
      },
    };
  }
}
