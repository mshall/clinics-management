import { BadRequestException, Injectable } from "@nestjs/common";
import { AppointmentStatus, Gender, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";

export const SAMPLE_PATIENT_MRN = "SAMPLE-DEMO";

export type SampleDataDto = {
  patientId: string;
  appointmentId: string | null;
  created: boolean;
};

/**
 * ON-08 — one clearly marked demo patient (+ an appointment later today) so new users can try the flow.
 * `Patient.isSample` keeps it out of reports, revenue (postRevenue), commissions and WhatsApp/SMS.
 */
@Injectable()
export class SampleDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(tenantId: string): Promise<SampleDataDto | null> {
    const patient = await this.prisma.patient.findFirst({
      where: { tenantId, isSample: true, deletedAt: null },
      select: { id: true, appointments: { select: { id: true }, orderBy: { startsAt: "asc" }, take: 1 } },
    });
    if (!patient) return null;
    return { patientId: patient.id, appointmentId: patient.appointments[0]?.id ?? null, created: false };
  }

  private async pickClinician(tenantId: string, user: JwtUser): Promise<string | null> {
    if (hasRole(user, UserRole.PHYSICIAN)) return user.userId;
    const physician = await this.prisma.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        deactivatedAt: null,
        OR: [{ role: UserRole.PHYSICIAN }, { additionalRoles: { has: UserRole.PHYSICIAN } }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return physician?.id ?? null;
  }

  async create(tenantId: string, user: JwtUser): Promise<SampleDataDto> {
    const existing = await this.get(tenantId);
    if (existing) return existing;
    const clinic = await this.prisma.clinic.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!clinic) throw new BadRequestException("Add a clinic first");
    const clinicianId = await this.pickClinician(tenantId, user);

    const startsAt = new Date(Date.now() + 60 * 60_000);
    startsAt.setMinutes(startsAt.getMinutes() < 30 ? 30 : 60, 0, 0);
    const result = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          tenantId,
          mrn: SAMPLE_PATIENT_MRN,
          firstNameEn: "Sample",
          lastNameEn: "Patient (demo)",
          firstNameAr: "مريض",
          lastNameAr: "تجريبي",
          gender: Gender.UNKNOWN,
          dob: new Date(Date.UTC(1990, 0, 1)),
          phone: "",
          homeBranchId: clinic.id,
          isSample: true,
        },
      });
      const appointment = clinicianId
        ? await tx.appointment.create({
            data: {
              tenantId,
              clinicId: clinic.id,
              patientId: patient.id,
              clinicianId,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 15 * 60_000),
              feeAmount: 0,
              status: AppointmentStatus.SCHEDULED,
            },
          })
        : null;
      return { patientId: patient.id, appointmentId: appointment?.id ?? null, created: true };
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: clinic.id,
      action: "SAMPLE_DATA_CREATED",
      resource: "Patient",
      resourceId: result.patientId,
    });
    return result;
  }

  async remove(tenantId: string, user: JwtUser): Promise<{ removed: number }> {
    const rows = await this.prisma.patient.findMany({ where: { tenantId, isSample: true }, select: { id: true } });
    if (!rows.length) return { removed: 0 };
    const ids = rows.map((r) => r.id);
    await this.prisma.patient.deleteMany({ where: { tenantId, id: { in: ids }, isSample: true } });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "SAMPLE_DATA_REMOVED",
      resource: "Patient",
      resourceId: null,
      metadata: { count: ids.length },
    });
    return { removed: ids.length };
  }
}
