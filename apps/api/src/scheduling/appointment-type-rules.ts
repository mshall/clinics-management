import { Prisma, type AppointmentType, type ClinicianAppointmentTypeOverride } from "@prisma/client";
import { addMinutes } from "../common/appointment-scheduling";

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

export type EffectiveAppointmentType = {
  id: string;
  durationMinutes: number;
  feeAmount: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  requiresRoom: boolean;
  marketplaceBookable: boolean;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  depositAmount: number | null;
  newPatientOnly: boolean;
  colorHex: string;
  nameEn: string;
  nameAr: string;
};

export function mapEffectiveAppointmentType(
  type: AppointmentType,
  override?: ClinicianAppointmentTypeOverride | null,
): EffectiveAppointmentType {
  const fee = override?.feeAmount != null ? decimalToNumber(override.feeAmount) : decimalToNumber(type.feeAmount);
  return {
    id: type.id,
    durationMinutes: override?.durationMinutes ?? type.durationMinutes,
    feeAmount: fee,
    bufferBeforeMin: type.bufferBeforeMin,
    bufferAfterMin: type.bufferAfterMin,
    requiresRoom: type.requiresRoom,
    marketplaceBookable: type.marketplaceBookable,
    minNoticeMinutes: type.minNoticeMinutes,
    maxDaysAhead: type.maxDaysAhead,
    depositAmount: type.depositAmount != null ? decimalToNumber(type.depositAmount) : null,
    newPatientOnly: type.newPatientOnly,
    colorHex: type.colorHex,
    nameEn: type.nameEn,
    nameAr: type.nameAr,
  };
}

export function schedulingBlockWithBuffers(
  start: Date,
  end: Date,
  bufferBeforeMin: number,
  bufferAfterMin: number,
): { blockStart: Date; blockEnd: Date } {
  return {
    blockStart: addMinutes(start, -Math.max(0, bufferBeforeMin)),
    blockEnd: addMinutes(end, Math.max(0, bufferAfterMin)),
  };
}

export function patchAppointmentTypeData(
  body: Record<string, unknown>,
): Prisma.AppointmentTypeUpdateInput {
  const data: Prisma.AppointmentTypeUpdateInput = {};
  if (body.nameEn !== undefined) data.nameEn = String(body.nameEn).trim();
  if (body.nameAr !== undefined) data.nameAr = String(body.nameAr).trim();
  if (body.durationMinutes !== undefined) data.durationMinutes = Number(body.durationMinutes);
  if (body.feeAmount !== undefined) data.feeAmount = new Prisma.Decimal(String(body.feeAmount));
  if (body.colorHex !== undefined) data.colorHex = String(body.colorHex);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.bufferBeforeMin !== undefined) data.bufferBeforeMin = Number(body.bufferBeforeMin);
  if (body.bufferAfterMin !== undefined) data.bufferAfterMin = Number(body.bufferAfterMin);
  if (body.requiresRoom !== undefined) data.requiresRoom = Boolean(body.requiresRoom);
  if (body.marketplaceBookable !== undefined) data.marketplaceBookable = Boolean(body.marketplaceBookable);
  if (body.minNoticeMinutes !== undefined) data.minNoticeMinutes = Number(body.minNoticeMinutes);
  if (body.maxDaysAhead !== undefined) data.maxDaysAhead = Number(body.maxDaysAhead);
  if (body.newPatientOnly !== undefined) data.newPatientOnly = Boolean(body.newPatientOnly);
  if (body.depositAmount !== undefined) {
    const raw = body.depositAmount;
    data.depositAmount =
      raw === null || raw === "" ? null : new Prisma.Decimal(String(raw));
  }
  return data;
}