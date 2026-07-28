export const DEFAULT_CLINIC_OPENING_TIME = "09:00";
export const DEFAULT_CLINIC_CLOSING_TIME = "00:00";

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidClinicTimeHHmm(value: string): boolean {
  return TIME_HHMM.test(value.trim());
}

export function clinicTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.trim().split(":").map(Number);
  return h! * 60 + m!;
}

/** Midnight closing (00:00) means open until end of the calendar day. */
export function clinicClosingMinutes(hhmm: string): number {
  const trimmed = hhmm.trim();
  if (trimmed === "00:00") return 24 * 60;
  return clinicTimeToMinutes(trimmed);
}

export function assertValidClinicHours(openingTime: string, closingTime: string): void {
  if (!isValidClinicTimeHHmm(openingTime)) {
    throw new Error("Invalid openingTime");
  }
  if (!isValidClinicTimeHHmm(closingTime)) {
    throw new Error("Invalid closingTime");
  }
  if (closingTime.trim() !== DEFAULT_CLINIC_CLOSING_TIME) {
    if (clinicTimeToMinutes(openingTime) >= clinicTimeToMinutes(closingTime)) {
      throw new Error("Opening time must be before closing time");
    }
  }
}

export function normalizeClinicTime(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (trimmed && isValidClinicTimeHHmm(trimmed)) return trimmed;
  return fallback;
}
