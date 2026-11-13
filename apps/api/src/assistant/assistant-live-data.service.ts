import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { ClinicDto } from "../clinics/clinics.service";
import { ClinicsService } from "../clinics/clinics.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  messageAsksForClinicList,
  messageAsksForOrgUsers,
  messageAsksForPatientCount,
  messageNeedsClinicContext,
} from "./assistant-intent";

export type AssistantLiveClinic = {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: string;
  status: string;
  parentNameEn: string | null;
};

export type AssistantLiveSnapshot = {
  organization: { name: string; baseCurrency: string } | null;
  role: UserRole;
  displayName?: string;
  allowedNavKeys: string[];
  clinics?: AssistantLiveClinic[];
  patientCount?: number;
  organizationUserCount?: number;
  generatedAt: string;
};

@Injectable()
export class AssistantLiveDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinics: ClinicsService,
  ) {}

  private canSeePatients(navKeys: string[]): boolean {
    return navKeys.includes("patients");
  }

  private canSeeOrgUsers(navKeys: string[]): boolean {
    return navKeys.includes("admin");
  }

  async buildSnapshot(user: JwtUser, navKeys: string[], message: string): Promise<AssistantLiveSnapshot> {
    const tenantId = user.tenantId;
    const snapshot: AssistantLiveSnapshot = {
      organization: null,
      role: user.role,
      displayName: user.email,
      allowedNavKeys: navKeys,
      generatedAt: new Date().toISOString(),
    };

    if (!tenantId) return snapshot;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, baseCurrency: true },
    });
    if (tenant) {
      snapshot.organization = { name: tenant.name, baseCurrency: tenant.baseCurrency };
    }

    const loadClinics =
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      (messageNeedsClinicContext(message) ||
        navKeys.includes("clinics") ||
        navKeys.includes("admin") ||
        navKeys.includes("dashboard"));

    if (loadClinics) {
      const rows = await this.clinics.list(tenantId, user, false);
      snapshot.clinics = rows.map((c) => this.mapClinic(c));
    }

    if (this.canSeePatients(navKeys) && messageAsksForPatientCount(message)) {
      snapshot.patientCount = await this.prisma.patient.count({
        where: { tenantId, deletedAt: null },
      });
    }

    if (this.canSeeOrgUsers(navKeys) && messageAsksForOrgUsers(message)) {
      snapshot.organizationUserCount = await this.prisma.user.count({ where: { tenantId } });
    }

    return snapshot;
  }

  private mapClinic(c: ClinicDto): AssistantLiveClinic {
    return {
      id: c.id,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      country: c.country,
      kind: c.kind,
      status: c.recordStatus,
      parentNameEn: c.parentNameEn,
    };
  }

  formatClinicListReply(clinics: AssistantLiveClinic[], locale: "en" | "ar", orgName?: string): string {
    if (!clinics.length) {
      return locale === "ar"
        ? "لا توجد عيادات نشطة ضمن صلاحياتك الحالية."
        : "There are no active clinics in your current permissions.";
    }
    const header =
      locale === "ar"
        ? `${orgName ? `مؤسسة ${orgName}: ` : ""}${clinics.length} عيادة/فرع نشط يمكنك الوصول إليه:`
        : `${orgName ? `${orgName} — ` : ""}${clinics.length} active clinic(s) / branch(es) you can access:`;
    const lines = clinics.map((c, i) => {
      const name = locale === "ar" && c.nameAr.trim() ? c.nameAr : c.nameEn;
      const branch =
        c.parentNameEn && locale === "en"
          ? ` (branch of ${c.parentNameEn})`
          : c.parentNameEn && locale === "ar"
            ? ` (فرع)`
            : "";
      return locale === "ar"
        ? `${i + 1}. ${name} — ${c.city}, ${c.country}${branch}`
        : `${i + 1}. ${name} — ${c.city}, ${c.country}${branch} [${c.kind}]`;
    });
    return [header, ...lines].join("\n");
  }

  tryDirectDataReply(snapshot: AssistantLiveSnapshot, message: string, locale: "en" | "ar"): string | null {
    if (messageAsksForClinicList(message) && snapshot.clinics) {
      return this.formatClinicListReply(snapshot.clinics, locale, snapshot.organization?.name);
    }

    if (messageAsksForPatientCount(message) && snapshot.patientCount !== undefined) {
      return locale === "ar"
        ? `عدد المرضى النشطين في المؤسسة (ضمن صلاحياتك): ${snapshot.patientCount}.`
        : `Active patients in the organization (within your access): ${snapshot.patientCount}.`;
    }

    if (messageAsksForOrgUsers(message) && snapshot.organizationUserCount !== undefined) {
      return locale === "ar"
        ? `عدد مستخدمي المؤسسة: ${snapshot.organizationUserCount}.`
        : `Organization user accounts: ${snapshot.organizationUserCount}.`;
    }

    return null;
  }

  snapshotForPrompt(snapshot: AssistantLiveSnapshot): string {
    const slim = {
      organization: snapshot.organization,
      role: snapshot.role,
      allowedNavKeys: snapshot.allowedNavKeys,
      clinics: snapshot.clinics?.map((c) => ({
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        city: c.city,
        kind: c.kind,
        parentNameEn: c.parentNameEn,
      })),
      patientCount: snapshot.patientCount,
      organizationUserCount: snapshot.organizationUserCount,
    };
    return JSON.stringify(slim);
  }
}
