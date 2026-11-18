import { ConflictException, Injectable, BadRequestException } from "@nestjs/common";
import { Gender, PatientAcquisitionChannel, Prisma } from "@prisma/client";
import { normalizePhoneToE164 } from "../common/phone-e164";
import { PrismaService } from "../prisma/prisma.service";
import { MIN_PHONE_DIGITS, normalizePhoneDigits } from "../patients/patient-phone";

export type MarketplacePatientInput = {
  phone: string;
  nationalId?: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr?: string;
  lastNameAr?: string;
  gender?: Gender;
  email?: string;
};

@Injectable()
export class MarketplacePatientIntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOrCreate(tenantId: string, clinicId: string, input: MarketplacePatientInput): Promise<string> {
    const phone = input.phone?.trim();
    if (!phone || normalizePhoneDigits(phone).length < MIN_PHONE_DIGITS) {
      throw new BadRequestException("Valid phone is required");
    }
  const e164 = normalizePhoneToE164(phone) ?? phone;
    const nationalId = input.nationalId?.trim() || null;

    const byPhone = await this.findByPhone(tenantId, phone);
    const byNationalId = nationalId
      ? await this.prisma.patient.findFirst({
          where: { tenantId, nationalId, deletedAt: null },
          select: { id: true, nationalId: true, phone: true },
        })
      : null;

    if (byPhone && byNationalId && byPhone.id !== byNationalId.id) {
      throw new ConflictException({
        code: "PATIENT_IDENTITY_CONFLICT",
        message: "Phone and national ID match different patients; cannot merge automatically",
      });
    }

    if (byNationalId) {
      const storedNational = byNationalId.nationalId?.trim() || null;
      if (byPhone && storedNational && nationalId && storedNational !== nationalId) {
        throw new ConflictException({
          code: "PATIENT_IDENTITY_CONFLICT",
          message: "National ID does not match the patient for this phone",
        });
      }
      return byNationalId.id;
    }

    if (byPhone) {
      if (nationalId && byPhone.nationalId?.trim() && byPhone.nationalId.trim() !== nationalId) {
        throw new ConflictException({
          code: "PATIENT_IDENTITY_CONFLICT",
          message: "National ID conflicts with existing patient on this phone",
        });
      }
      if (nationalId && !byPhone.nationalId?.trim()) {
        const clash = await this.prisma.patient.findFirst({
          where: { tenantId, nationalId, deletedAt: null, NOT: { id: byPhone.id } },
        });
        if (clash) throw new BadRequestException("nationalId already in use");
        await this.prisma.patient.update({
          where: { id: byPhone.id },
          data: { nationalId },
        });
      }
      return byPhone.id;
    }

    if (nationalId) {
      const clash = await this.prisma.patient.findFirst({
        where: { tenantId, nationalId, deletedAt: null },
      });
      if (clash) return clash.id;
    }

    const mrn = await this.nextMrn(tenantId);
    const created = await this.prisma.patient.create({
      data: {
        tenantId,
        mrn,
        firstNameEn: input.firstNameEn.trim(),
        lastNameEn: input.lastNameEn.trim(),
        firstNameAr: (input.firstNameAr ?? input.firstNameEn).trim(),
        lastNameAr: (input.lastNameAr ?? input.lastNameEn).trim(),
        gender: input.gender ?? Gender.UNKNOWN,
        phone: e164,
        email: input.email?.trim() || null,
        nationalId,
        homeBranchId: clinicId,
        acquisitionChannel: PatientAcquisitionChannel.KIOREX,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async findByPhone(
    tenantId: string,
    phone: string,
  ): Promise<{ id: string; nationalId: string | null; phone: string } | null> {
    const digits = normalizePhoneDigits(phone);
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, deletedAt: null, phone: { contains: tail } },
      select: { id: true, nationalId: true, phone: true },
      take: 40,
    });
    const match = rows.find((p) => normalizePhoneDigits(p.phone) === digits);
    return match ?? null;
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