import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicalLetterType, ClinicalShortcutType, ClinicalSpecialty, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { ClinicalSafetyService } from "./clinical-safety.service";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";

const TEMPLATE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.PHYSICIAN,
  UserRole.GROUP_SUPERVISOR,
]);

function assertClinicalUser(user: JwtUser): void {
  if (!user.tenantId) throw new ForbiddenException("Tenant required");
  if (!hasAnyRoleInSet(user, TEMPLATE_ROLES)) throw new ForbiddenException("Not allowed");
}

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: ClinicalSafetyService,
  ) {}

  private async ensureCatalog(tenantId: string) {
    await this.safety.ensureDefaultCatalog(tenantId);
  }

  async listTemplates(
    tenantId: string,
    user: JwtUser,
    specialty?: ClinicalSpecialty,
    clinicId?: string,
  ) {
    assertClinicalUser(user);
    await this.ensureCatalog(tenantId);

    const clinicFilter = clinicId?.trim();
    if (clinicFilter) {
      const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicFilter, tenantId } });
      if (!clinic) throw new NotFoundException("Clinic not found");
    }

    const or: Prisma.ClinicalFormTemplateWhereInput[] = [
      { isSystemDefault: true, clinicId: null },
    ];
    if (clinicFilter) {
      or.push({ clinicId: clinicFilter, isSystemDefault: false, isPublished: true });
    }
    if (hasRole(user, UserRole.PHYSICIAN)) {
      or.push({ ownerUserId: user.userId });
    }

    return this.prisma.clinicalFormTemplate.findMany({
      where: {
        tenantId,
        ...(specialty ? { specialty } : {}),
        OR: or,
      },
      orderBy: [{ isSystemDefault: "desc" }, { specialty: "asc" }, { updatedAt: "desc" }],
    });
  }

  async upsertTemplate(
    tenantId: string,
    user: JwtUser,
    body: {
      id?: string;
      clinicId?: string;
      specialty: ClinicalSpecialty;
      customSpecialtyLabelEn?: string;
      customSpecialtyLabelAr?: string;
      name: string;
      description?: string;
      sectionsJson: unknown;
      isPublished?: boolean;
    },
  ) {
    assertClinicalUser(user);
    const manageClinic = new Set<UserRole>([
      UserRole.GROUP_ADMIN,
      UserRole.CLINIC_ADMIN,
      UserRole.BRANCH_MANAGER,
      UserRole.GROUP_SUPERVISOR,
    ]);
    if (!hasAnyRoleInSet(user, manageClinic)) {
      throw new ForbiddenException("Only clinic administrators can edit clinic form templates");
    }

    const sectionsJson = body.sectionsJson;
    if (!sectionsJson || typeof sectionsJson !== "object") {
      throw new BadRequestException("sectionsJson is required");
    }

    const clinicId = body.clinicId?.trim();
    if (!clinicId) throw new BadRequestException("clinicId is required");
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new BadRequestException("Invalid clinicId");

    if (body.specialty === ClinicalSpecialty.CUSTOM) {
      const label = body.customSpecialtyLabelEn?.trim() ?? "";
      if (label.length < 2) {
        throw new BadRequestException("customSpecialtyLabelEn is required for custom specialty");
      }
    }

    const data = {
      specialty: body.specialty,
      customSpecialtyLabelEn:
        body.specialty === ClinicalSpecialty.CUSTOM ? body.customSpecialtyLabelEn?.trim() ?? null : null,
      customSpecialtyLabelAr:
        body.specialty === ClinicalSpecialty.CUSTOM ? body.customSpecialtyLabelAr?.trim() ?? null : null,
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      sectionsJson: sectionsJson as Prisma.InputJsonValue,
      isPublished: true,
      isSystemDefault: false,
      clinicId,
      ownerUserId: null,
    };

    if (body.id) {
      const existing = await this.prisma.clinicalFormTemplate.findFirst({ where: { id: body.id, tenantId } });
      if (!existing) throw new NotFoundException("Template not found");
      if (existing.isSystemDefault) {
        throw new BadRequestException("System default templates cannot be edited — duplicate as a custom template");
      }
      if (existing.clinicId !== clinicId) {
        throw new BadRequestException("Template does not belong to this clinic");
      }
      return this.prisma.clinicalFormTemplate.update({ where: { id: body.id }, data });
    }
    return this.prisma.clinicalFormTemplate.create({ data: { tenantId, ...data } });
  }

  async deleteClinicTemplate(tenantId: string, user: JwtUser, id: string) {
    assertClinicalUser(user);
    const manageClinic = new Set<UserRole>([
      UserRole.GROUP_ADMIN,
      UserRole.CLINIC_ADMIN,
      UserRole.BRANCH_MANAGER,
      UserRole.GROUP_SUPERVISOR,
    ]);
    if (!hasAnyRoleInSet(user, manageClinic)) throw new ForbiddenException("Not allowed");

    const existing = await this.prisma.clinicalFormTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Template not found");
    if (existing.isSystemDefault) throw new BadRequestException("Cannot delete system default template");
    if (!existing.clinicId) throw new BadRequestException("Cannot delete organization template");

    const inUse = await this.prisma.encounter.count({ where: { clinicalTemplateId: id, tenantId } });
    if (inUse > 0) {
      throw new BadRequestException("Template is linked to encounters — retire usage before delete");
    }

    await this.prisma.clinicalFormTemplate.delete({ where: { id } });
    return { ok: true as const, id };
  }

  async listShortcuts(tenantId: string, user: JwtUser) {
    assertClinicalUser(user);
    return this.prisma.clinicianShortcut.findMany({
      where: { tenantId, userId: user.userId },
      orderBy: { label: "asc" },
    });
  }

  async saveShortcut(
    tenantId: string,
    user: JwtUser,
    body: { type: ClinicalShortcutType; label: string; trigger?: string; payload: unknown },
  ) {
    assertClinicalUser(user);
    return this.prisma.clinicianShortcut.create({
      data: {
        tenantId,
        userId: user.userId,
        type: body.type,
        label: body.label.trim(),
        trigger: body.trigger?.trim() || null,
        payload: body.payload as Prisma.InputJsonValue,
      },
    });
  }

  async deleteShortcut(tenantId: string, user: JwtUser, id: string) {
    const row = await this.prisma.clinicianShortcut.findFirst({ where: { id, tenantId, userId: user.userId } });
    if (!row) throw new NotFoundException();
    await this.prisma.clinicianShortcut.delete({ where: { id } });
    return { ok: true };
  }

  async searchIcd10(tenantId: string, user: JwtUser, q: string) {
    assertClinicalUser(user);
    await this.ensureCatalog(tenantId);
    const term = q.trim();
    const favorites = await this.prisma.clinicianDiagnosisFavorite.findMany({
      where: { tenantId, userId: user.userId },
      orderBy: { sortOrder: "asc" },
    });
    const favCodes = new Set(favorites.map((f) => f.icd10Code));
    const where: Prisma.Icd10EntryWhereInput = { OR: [{ tenantId }, { tenantId: null }] };
    if (term.length >= 2) {
      where.AND = [
        {
          OR: [
            { icd10Code: { contains: term, mode: "insensitive" } },
            { descriptionEn: { contains: term, mode: "insensitive" } },
            { descriptionAr: { contains: term, mode: "insensitive" } },
            { keywords: { contains: term, mode: "insensitive" } },
          ],
        },
      ];
    }
    const rows = await this.prisma.icd10Entry.findMany({ where, take: 40 });
    const favRows = rows.filter((r) => favCodes.has(r.icd10Code));
    const rest = rows.filter((r) => !favCodes.has(r.icd10Code));
    return [...favRows, ...rest];
  }

  async addDiagnosisFavorite(tenantId: string, user: JwtUser, icd10Code: string) {
    assertClinicalUser(user);
    return this.prisma.clinicianDiagnosisFavorite.upsert({
      where: { tenantId_userId_icd10Code: { tenantId, userId: user.userId, icd10Code: icd10Code.trim() } },
      create: { tenantId, userId: user.userId, icd10Code: icd10Code.trim() },
      update: {},
    });
  }

  async lastVisitSnapshot(tenantId: string, user: JwtUser, patientId: string, excludeEncounterId?: string) {
    assertClinicalUser(user);
    const enc = await this.prisma.encounter.findFirst({
      where: {
        tenantId,
        patientId,
        status: { in: ["FINALIZED", "AMENDED"] },
        ...(excludeEncounterId ? { NOT: { id: excludeEncounterId } } : {}),
      },
      orderBy: { finalizedAt: "desc" },
      include: { diagnoses: true, medications: true },
    });
    if (!enc) return null;
    return {
      encounterId: enc.id,
      visitType: enc.visitType,
      subjective: enc.subjective,
      objective: enc.objective,
      assessment: enc.assessment,
      plan: enc.plan,
      diagnoses: enc.diagnoses,
      medications: enc.medications,
      finalizedAt: enc.finalizedAt?.toISOString() ?? null,
    };
  }

  async generateLetter(
    tenantId: string,
    user: JwtUser,
    body: {
      type: ClinicalLetterType;
      patientId: string;
      encounterId?: string;
      fields?: Record<string, string>;
    },
  ) {
    assertClinicalUser(user);
    const patient = await this.prisma.patient.findFirst({ where: { id: body.patientId, tenantId } });
    if (!patient) throw new NotFoundException("Patient not found");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const name = `${patient.firstNameEn} ${patient.lastNameEn}`.trim();
    const nameAr = `${patient.firstNameAr ?? patient.firstNameEn} ${patient.lastNameAr ?? patient.lastNameEn}`.trim();
    const days = body.fields?.days ?? "3";
    const diagnosis = body.fields?.diagnosis ?? body.fields?.reason ?? "as documented in the medical record";
    const clinic = body.fields?.clinicName ?? tenant?.name ?? "Clinic";
    const today = new Date().toLocaleDateString("en-GB");

    let titleEn = "Medical letter";
    let titleAr = "تقرير طبي";
    let bodyEn = "";
    let bodyAr = "";

    switch (body.type) {
      case ClinicalLetterType.SICK_LEAVE:
        titleEn = "Sick leave certificate";
        titleAr = "شهادة مرضية";
        bodyEn = `${clinic}\nDate: ${today}\n\nTo whom it may concern,\n\nThis is to certify that ${name} (MRN ${patient.mrn}) was examined and is advised sick leave for ${days} day(s).\n\nDiagnosis / reason: ${diagnosis}.\n\nPhysician: ${user.email}`;
        bodyAr = `${clinic}\nالتاريخ: ${today}\n\nإلى من يهمه الأمر،\n\nنشهد أن ${nameAr} (رقم الملف ${patient.mrn}) قد فُحص ويُنصح بإجازة مرضية لمدة ${days} يوم(أيام).\n\nالتشخيص / السبب: ${diagnosis}.\n\nالطبيب: ${user.email}`;
        break;
      case ClinicalLetterType.REFERRAL:
        titleEn = "Referral letter";
        titleAr = "خطاب تحويل";
        bodyEn = `Referral for ${name} (MRN ${patient.mrn}) to ${body.fields?.referTo ?? "specialist"}.\nReason: ${diagnosis}.`;
        bodyAr = `تحويل للمريض ${nameAr} إلى ${body.fields?.referTo ?? "اختصاصي"}.\nالسبب: ${diagnosis}.`;
        break;
      case ClinicalLetterType.FITNESS_CERTIFICATE:
        titleEn = "Fitness certificate";
        titleAr = "شهادة لياقة";
        bodyEn = `This certifies that ${name} is fit for ${body.fields?.activity ?? "work"} as of ${today}.`;
        bodyAr = `نشهد أن ${nameAr} لائق لـ ${body.fields?.activity ?? "العمل"} بتاريخ ${today}.`;
        break;
      default:
        titleEn = "Medical report";
        titleAr = "تقرير طبي";
        bodyEn = body.fields?.notes ?? `Medical report for ${name}.\n${diagnosis}`;
        bodyAr = body.fields?.notesAr ?? `تقرير طبي للمريض ${nameAr}.\n${diagnosis}`;
    }

    return this.prisma.clinicalLetter.create({
      data: {
        tenantId,
        patientId: body.patientId,
        encounterId: body.encounterId ?? null,
        type: body.type,
        titleEn,
        titleAr,
        bodyEn,
        bodyAr,
        createdByUserId: user.userId,
      },
    });
  }

  async patientVitalsSeries(tenantId: string, user: JwtUser, patientId: string) {
    assertClinicalUser(user);
    const rows = await this.prisma.encounter.findMany({
      where: { tenantId, patientId, OR: [{ heartRate: { not: null } }, { weightKg: { not: null } }, { heightCm: { not: null } }] },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        updatedAt: true,
        heartRate: true,
        spo2: true,
        bpSystolic: true,
        bpDiastolic: true,
        temperature: true,
        weightKg: true,
        heightCm: true,
        patient: { select: { dob: true } },
      },
      take: 200,
    });
    return rows.map((r) => ({
      encounterId: r.id,
      at: r.updatedAt.toISOString(),
      heartRate: r.heartRate,
      spo2: r.spo2,
      bpSystolic: r.bpSystolic,
      bpDiastolic: r.bpDiastolic,
      temperature: r.temperature != null ? Number(r.temperature) : null,
      weightKg: r.weightKg != null ? Number(r.weightKg) : null,
      heightCm: r.heightCm != null ? Number(r.heightCm) : null,
      patientDob: r.patient.dob?.toISOString() ?? null,
    }));
  }
}
