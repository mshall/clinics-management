import { BadRequestException, Injectable } from "@nestjs/common";
import { Gender, PatientAcquisitionChannel } from "@prisma/client";
import { normalizePhoneToE164 } from "../common/phone-e164";
import { PrismaService } from "../prisma/prisma.service";
import { MIN_PHONE_DIGITS, normalizePhoneDigits } from "./patient-phone";
import type { ProvisionalPatientDto } from "../appointments/dto/provisional-patient.dto";
import type { PatientPhoneConflictPatientDto } from "./dto/patient-phone-conflict.dto";

@Injectable()
export class ProvisionalPatientService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a provisional chart (profileComplete=false) for first-time booking.
   * If the phone already belongs to a patient in this org, reject with PHONE_IN_USE
   * so the client can show the existing chart and book against that patient instead.
   */
  async resolveOrCreateProvisional(
    tenantId: string,
    clinicId: string,
    input: ProvisionalPatientDto,
  ): Promise<{ patientId: string; created: boolean }> {
    const firstNameEn = input.firstNameEn?.trim();
    const lastNameEn = input.lastNameEn?.trim();
    const phoneRaw = input.phone?.trim();
    if (!firstNameEn || !lastNameEn) {
      throw new BadRequestException("First and last name are required for a new patient booking");
    }
    if (!phoneRaw || normalizePhoneDigits(phoneRaw).length < MIN_PHONE_DIGITS) {
      throw new BadRequestException("Valid phone is required for a new patient booking");
    }
    const e164 = normalizePhoneToE164(phoneRaw) ?? phoneRaw;
    const firstNameAr = (input.firstNameAr?.trim() || firstNameEn).trim();
    const lastNameAr = (input.lastNameAr?.trim() || lastNameEn).trim();
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`patient-phone:${tenantId}:${normalizePhoneDigits(e164)}`}))`;
      const existing = await this.findConflictByPhone(tenantId, phoneRaw);
      if (existing) {
        throw new BadRequestException({
          message: "phone already in use",
          code: "PHONE_IN_USE",
          existingPatient: existing,
        });
      }
      const mrn = await this.nextMrn(tenantId);
      return tx.patient.create({
        data: {
          tenantId,
          mrn,
          firstNameEn,
          lastNameEn,
          firstNameAr,
          lastNameAr,
          gender: Gender.UNKNOWN,
          phone: e164,
          homeBranchId: clinicId,
          acquisitionChannel: PatientAcquisitionChannel.OTHER,
          acquisitionOtherDetail: "Provisional booking — complete profile before visit",
          profileComplete: false,
        },
        select: { id: true },
      });
    });
    return { patientId: created.id, created: true };
  }

  private async findConflictByPhone(
    tenantId: string,
    phone: string,
  ): Promise<PatientPhoneConflictPatientDto | null> {
    const digits = normalizePhoneDigits(phone);
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, deletedAt: null, phone: { contains: tail } },
      select: {
        id: true,
        mrn: true,
        phone: true,
        firstNameEn: true,
        lastNameEn: true,
        firstNameAr: true,
        lastNameAr: true,
        dob: true,
        gender: true,
        profileComplete: true,
        createdAt: true,
      },
      take: 40,
    });
    const match = rows.find((p) => normalizePhoneDigits(p.phone) === digits);
    if (!match) return null;
    return {
      id: match.id,
      mrn: match.mrn,
      phone: match.phone,
      firstNameEn: match.firstNameEn,
      lastNameEn: match.lastNameEn,
      firstNameAr: match.firstNameAr,
      lastNameAr: match.lastNameAr,
      dob: match.dob ? match.dob.toISOString().slice(0, 10) : null,
      gender: match.gender,
      profileComplete: match.profileComplete,
      createdAt: match.createdAt.toISOString(),
    };
  }

  private async nextMrn(tenantId: string): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const mrn = `MRN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const exists = await this.prisma.patient.findFirst({ where: { tenantId, mrn } });
      if (!exists) return mrn;
    }
    throw new BadRequestException("Could not allocate MRN");
  }
}
