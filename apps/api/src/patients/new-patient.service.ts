import { Injectable } from "@nestjs/common";
import { AppointmentStatus, EncounterStatus, PatientAcquisitionChannel, Prisma } from "@prisma/client";
import { normalizePhoneToE164 } from "../common/phone-e164";
import { PrismaService } from "../prisma/prisma.service";
import { phonesMatch } from "./patient-phone";
import { lookbackStartAt, resolveNewPatientLookbackMonths } from "./new-patient-config";

type PatientIdentity = { phone: string | null; nationalId: string | null };

@Injectable()
export class NewPatientService {
  constructor(private readonly prisma: PrismaService) {}

  private async lookbackMonthsForTenant(tenantId: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { market: { select: { featureDefaults: true } } },
    });
    return resolveNewPatientLookbackMonths(tenant?.market?.featureDefaults ?? null);
  }

  private e164Matches(stored: string | null, targetE164: string | null, targetRaw: string): boolean {
    if (!stored?.trim()) return false;
    if (targetE164) {
      const storedE164 = normalizePhoneToE164(stored);
      if (storedE164 && storedE164 === targetE164) return true;
    }
    return phonesMatch(stored, targetRaw);
  }

  async matchingPatientIds(
    tenantId: string,
    phone: string | null,
    nationalId: string | null,
  ): Promise<string[]> {
    const trimmedNational = nationalId?.trim() || null;
    const phoneRaw = phone?.trim() || "";
    const phoneE164 = phoneRaw ? normalizePhoneToE164(phoneRaw) : null;

    if (!trimmedNational && !phoneRaw) return [];

    const rows: { id: string; phone: string | null; nationalId: string | null }[] = [];
    if (trimmedNational) {
      rows.push(
        ...(await this.prisma.patient.findMany({
          where: { tenantId, deletedAt: null, nationalId: trimmedNational },
          select: { id: true, phone: true, nationalId: true },
          take: 100,
        })),
      );
    }
    if (phoneRaw) {
      const tail = phoneRaw.replace(/\D/g, "").slice(-9);
      if (tail.length >= 7) {
        rows.push(
          ...(await this.prisma.patient.findMany({
            where: { tenantId, deletedAt: null, phone: { contains: tail } },
            select: { id: true, phone: true, nationalId: true },
            take: 200,
          })),
        );
      }
      const withPhone = await this.prisma.patient.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, phone: true, nationalId: true },
        take: 2000,
      });
      rows.push(...withPhone);
    }

    const ids = new Set<string>();
    for (const row of rows) {
      if (trimmedNational && row.nationalId?.trim() === trimmedNational) {
        ids.add(row.id);
        continue;
      }
      if (phoneRaw && this.e164Matches(row.phone, phoneE164, phoneRaw)) {
        ids.add(row.id);
      }
    }
    return [...ids];
  }

  /** True when no attended visit or finalized encounter for this identity in the lookback window ending at `atDate`. */
  async isNewToTenant(
    tenantId: string,
    phone: string | null,
    nationalId: string | null,
    atDate: Date = new Date(),
    lookbackMonths?: number,
  ): Promise<boolean> {
    const months = lookbackMonths ?? (await this.lookbackMonthsForTenant(tenantId));
    const windowStart = lookbackStartAt(atDate, months);
    const patientIds = await this.matchingPatientIds(tenantId, phone, nationalId);
    if (!patientIds.length) return true;

    const imported = await this.prisma.patient.findFirst({
      where: { tenantId, id: { in: patientIds }, acquisitionChannel: PatientAcquisitionChannel.IMPORT },
      select: { id: true },
    });
    if (imported) return false;

    const attended = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        patientId: { in: patientIds },
        status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED] },
        checkedInAt: { gte: windowStart, lt: atDate },
      },
      select: { id: true },
    });
    if (attended) return false;

    const signed = await this.prisma.encounter.findFirst({
      where: {
        tenantId,
        patientId: { in: patientIds },
        status: EncounterStatus.FINALIZED,
        OR: [
          { signedAt: { gte: windowStart, lt: atDate } },
          { finalizedAt: { gte: windowStart, lt: atDate } },
        ],
      },
      select: { id: true },
    });
    return !signed;
  }

  /** Attended visit for same identity (phone / national ID) strictly before `before`. */
  async hadPriorAttendedVisit(tenantId: string, patientId: string, before: Date): Promise<boolean> {
    const { phone, nationalId } = await this.identityForPatient(tenantId, patientId);
    const patientIds = await this.matchingPatientIds(tenantId, phone, nationalId);
    const ids = patientIds.length ? patientIds : [patientId];
    const imported = await this.prisma.patient.findFirst({
      where: { tenantId, id: { in: ids }, acquisitionChannel: PatientAcquisitionChannel.IMPORT, createdAt: { lt: before } },
      select: { id: true },
    });
    if (imported) return true;
    const prior = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        patientId: { in: ids },
        status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED] },
        checkedInAt: { lt: before },
      },
      select: { id: true },
    });
    return !!prior;
  }

  async identityForPatient(tenantId: string, patientId: string): Promise<PatientIdentity> {
    const p = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: { phone: true, nationalId: true },
    });
    return { phone: p?.phone ?? null, nationalId: p?.nationalId ?? null };
  }

  async stampNewPatientAtBooking(
    tenantId: string,
    patientId: string,
    atDate: Date,
  ): Promise<{ isNewPatientAtBooking: boolean; newPatientCheckedAt: Date }> {
    const { phone, nationalId } = await this.identityForPatient(tenantId, patientId);
    const isNew = await this.isNewToTenant(tenantId, phone, nationalId, atDate);
    const checkedAt = new Date();
    return { isNewPatientAtBooking: isNew, newPatientCheckedAt: checkedAt };
  }
}