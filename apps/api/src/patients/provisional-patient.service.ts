import { BadRequestException, Injectable } from "@nestjs/common";
import { Gender, PatientAcquisitionChannel } from "@prisma/client";
import { normalizePhoneToE164 } from "../common/phone-e164";
import { PrismaService } from "../prisma/prisma.service";
import { MIN_PHONE_DIGITS, normalizePhoneDigits } from "./patient-phone";
import type { ProvisionalPatientDto } from "../appointments/dto/provisional-patient.dto";

@Injectable()
export class ProvisionalPatientService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve an existing patient by phone, or create a provisional chart (profileComplete=false)
   * for first-time booking without full registration.
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
    const existing = await this.findByPhone(tenantId, phoneRaw);
    if (existing) {
      return { patientId: existing.id, created: false };
    }

    const mrn = await this.nextMrn(tenantId);
    const firstNameAr = (input.firstNameAr?.trim() || firstNameEn).trim();
    const lastNameAr = (input.lastNameAr?.trim() || lastNameEn).trim();
    const created = await this.prisma.patient.create({
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
    return { patientId: created.id, created: true };
  }

  private async findByPhone(tenantId: string, phone: string): Promise<{ id: string } | null> {
    const digits = normalizePhoneDigits(phone);
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, deletedAt: null, phone: { contains: tail } },
      select: { id: true, phone: true },
      take: 40,
    });
    const match = rows.find((p) => normalizePhoneDigits(p.phone) === digits);
    return match ? { id: match.id } : null;
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
