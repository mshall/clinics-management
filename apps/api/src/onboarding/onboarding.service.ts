import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, FiscalDeviceStatus, Prisma, UserRole, VerificationStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ONBOARDING_REQUIRED_STEPS,
  ONBOARDING_STEP_KEYS,
  SKIPPED_STEP_VALUE,
  allRequiredStepsSatisfied,
  isCr01ActivationMet,
  isStepSatisfied,
  type OnboardingStepKey,
  type OnboardingStepsJson,
} from "./onboarding-steps";
import { detectAutoCompletedSteps, mergeAutoSteps, type OnboardingSyncInput } from "./onboarding-sync";

export type OnboardingStepDto = {
  key: OnboardingStepKey;
  required: boolean;
  status: "pending" | "done" | "skipped";
  completedAt: string | null;
  href: string;
};

export type OnboardingProgressDto = {
  steps: OnboardingStepDto[];
  completedAt: string | null;
  activatedAt: string | null;
  activationJustAchieved: boolean;
  celebrateActivation: boolean;
  primaryClinicId: string | null;
  progressPercent: number;
};

const STEP_PATHS: Record<OnboardingStepKey, string> = {
  clinic_profile: "/admin",
  clinic_logo: "/admin",
  working_hours: "/admin",
  appointment_types: "/clinics",
  doctor_availability: "/profile",
  invite_receptionist: "/admin",
  whatsapp_reminders: "/admin",
  import_patients: "/onboarding/import",
  first_appointment: "/appointments",
  first_check_in: "/front-desk/board",
  kiorex_profile: "/clinics",
  doctor_verification: "/profile/verification",
};

function parseStepsJson(raw: unknown): OnboardingStepsJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OnboardingStepsJson = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreate(tenantId: string): Promise<OnboardingProgressDto> {
    let row = await this.prisma.onboardingProgress.findUnique({ where: { tenantId } });
    if (!row) {
      row = await this.prisma.onboardingProgress.create({
        data: { tenantId, stepsJson: {} },
      });
    }

    const syncInput = await this.loadSyncInput(tenantId);
    const existing = parseStepsJson(row.stepsJson);
    const detected = syncInput ? detectAutoCompletedSteps(syncInput) : {};
    let steps = mergeAutoSteps(existing, detected);

    const wasActivated = Boolean(row.activatedAt);
    const cr01Now = isCr01ActivationMet(steps);
    let activatedAt = row.activatedAt;
    let activationJustAchieved = false;

    if (cr01Now && !wasActivated) {
      activatedAt = new Date();
      activationJustAchieved = true;
      await this.audit.recordEvent({
        tenantId,
        actorId: null,
        clinicId: syncInput?.clinics[0]?.id ?? null,
        action: "TENANT_ACTIVATED",
        resource: "Onboarding",
        resourceId: tenantId,
        metadata: { rule: "CR-01", steps: { first_appointment: steps.first_appointment, first_check_in: steps.first_check_in } },
      });
    }

    const allRequired = allRequiredStepsSatisfied(steps);
    const completedAt = allRequired ? row.completedAt ?? new Date() : null;

    if (JSON.stringify(steps) !== JSON.stringify(existing) || activationJustAchieved || (allRequired && !row.completedAt)) {
      row = await this.prisma.onboardingProgress.update({
        where: { tenantId },
        data: {
          stepsJson: steps as unknown as Prisma.InputJsonValue,
          activatedAt,
          completedAt: allRequired ? completedAt : null,
        },
      });
    }

    const primaryClinicId = syncInput?.clinics[0]?.id ?? null;
    return this.toDto(steps, row.completedAt, row.activatedAt, activationJustAchieved, primaryClinicId);
  }

  async patchStep(
    tenantId: string,
    actorId: string,
    key: string,
    action: "complete" | "skip",
  ): Promise<OnboardingProgressDto> {
    if (!ONBOARDING_STEP_KEYS.includes(key as OnboardingStepKey)) {
      throw new NotFoundException("Unknown onboarding step");
    }
    const stepKey = key as OnboardingStepKey;
    if (action === "skip" && ONBOARDING_REQUIRED_STEPS.includes(stepKey)) {
      throw new BadRequestException("Required steps cannot be skipped");
    }

    await this.getOrCreate(tenantId);
    const row = await this.prisma.onboardingProgress.findUniqueOrThrow({ where: { tenantId } });
    const steps = parseStepsJson(row.stepsJson);
    const value = action === "skip" ? SKIPPED_STEP_VALUE : new Date().toISOString();
    steps[stepKey] = value;

    await this.audit.recordEvent({
      tenantId,
      actorId,
      clinicId: null,
      action: action === "skip" ? "ONBOARDING_STEP_SKIPPED" : "ONBOARDING_STEP_COMPLETED",
      resource: "Onboarding",
      resourceId: stepKey,
      metadata: { step: stepKey },
    });

    await this.prisma.onboardingProgress.update({
      where: { tenantId },
      data: { stepsJson: steps as unknown as Prisma.InputJsonValue },
    });

    return this.getOrCreate(tenantId);
  }

  private async loadSyncInput(tenantId: string): Promise<OnboardingSyncInput | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        whatsAppRemindersEnabled: true,
        createdAt: true,
        clinics: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            logoUrl: true,
            licenseNumber: true,
            openingTime: true,
            closingTime: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!tenant) return null;

    const [
      appointmentTypeCount,
      apptTypeRow,
      availRow,
      staffBeyondOwner,
      patientCount,
      appointmentCount,
      checkedInAppointmentCount,
      fiscalReady,
      kiorexCount,
      verifiedPhysicianCount,
    ] = await Promise.all([
      this.prisma.appointmentType.count({ where: { tenantId } }),
      this.prisma.appointmentType.findFirst({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true, createdAt: true },
      }),
      this.prisma.clinicianAvailabilityTemplate.findFirst({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true, createdAt: true },
      }),
      this.prisma.user
        .count({
          where: {
            tenantId,
            deletedAt: null,
            OR: [
              { role: UserRole.RECEPTIONIST },
              { role: UserRole.CALL_CENTER },
              { additionalRoles: { has: UserRole.RECEPTIONIST } },
              { additionalRoles: { has: UserRole.CALL_CENTER } },
            ],
          },
        })
        .then((n) => n > 0),
      this.prisma.patient.count({ where: { tenantId } }),
      this.prisma.appointment.count({ where: { tenantId } }),
      this.prisma.appointment.count({
        where: { tenantId, status: AppointmentStatus.CHECKED_IN },
      }),
      this.prisma.fiscalDevice
        .count({
          where: {
            tenantId,
            status: FiscalDeviceStatus.ACTIVE,
          },
        })
        .then((n) => n > 0),
      this.prisma.appointmentType.count({
        where: { tenantId, marketplaceBookable: true },
      }),
      this.prisma.clinicianVerification.count({
        where: {
          tenantId,
          status: VerificationStatus.VERIFIED,
          user: {
            OR: [{ role: UserRole.PHYSICIAN }, { additionalRoles: { has: UserRole.PHYSICIAN } }],
          },
        },
      }),
    ]);

    const appointmentTypeCustomized =
      Boolean(apptTypeRow) &&
      (appointmentTypeCount > 2 ||
        apptTypeRow!.updatedAt.getTime() > apptTypeRow!.createdAt.getTime() + 2000);

    const availabilityTemplateUpdated =
      Boolean(availRow) && availRow!.updatedAt.getTime() > availRow!.createdAt.getTime() + 2000;

    return {
      tenant: {
        whatsAppRemindersEnabled: tenant.whatsAppRemindersEnabled,
        createdAt: tenant.createdAt,
      },
      clinics: tenant.clinics,
      appointmentTypeCount,
      appointmentTypeCustomized,
      availabilityTemplateUpdated,
      staffBeyondOwner,
      patientCount,
      appointmentCount,
      checkedInAppointmentCount,
      fiscalDeviceReady: fiscalReady,
      kiorexProfileReady: kiorexCount > 0 && verifiedPhysicianCount > 0,
      doctorVerificationReady: verifiedPhysicianCount > 0,
    };
  }

  private toDto(
    steps: OnboardingStepsJson,
    completedAt: Date | null,
    activatedAt: Date | null,
    activationJustAchieved: boolean,
    primaryClinicId: string | null,
  ): OnboardingProgressDto {
    const stepDtos: OnboardingStepDto[] = ONBOARDING_STEP_KEYS.map((key) => {
      const raw = steps[key];
      let status: OnboardingStepDto["status"] = "pending";
      if (raw === SKIPPED_STEP_VALUE) status = "skipped";
      else if (isStepSatisfied(raw)) status = "done";
      let href = STEP_PATHS[key];
      if (primaryClinicId && (key === "appointment_types" || key === "kiorex_profile")) {
        href = `/clinics/${primaryClinicId}`;
      }
      return {
        key,
        required: ONBOARDING_REQUIRED_STEPS.includes(key),
        status,
        completedAt: raw && raw !== SKIPPED_STEP_VALUE ? raw : null,
        href,
      };
    });

    const requiredDone = ONBOARDING_REQUIRED_STEPS.filter((k) => isStepSatisfied(steps[k])).length;
    const progressPercent = Math.round((requiredDone / ONBOARDING_REQUIRED_STEPS.length) * 100);

    return {
      steps: stepDtos,
      completedAt: completedAt?.toISOString() ?? null,
      activatedAt: activatedAt?.toISOString() ?? null,
      activationJustAchieved,
      celebrateActivation: Boolean(activatedAt),
      primaryClinicId,
      progressPercent,
    };
  }
}
