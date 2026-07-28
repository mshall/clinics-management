import { splitDatetimeLocal } from "@/lib/appointment-scheduling";

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

export function clinicClosingMinutes(hhmm: string): number {
  const trimmed = hhmm.trim();
  if (trimmed === "00:00") return 24 * 60;
  return clinicTimeToMinutes(trimmed);
}

export function resolveClinicOpeningTime(openingTime?: string | null): string {
  const trimmed = openingTime?.trim();
  if (trimmed && isValidClinicTimeHHmm(trimmed)) return trimmed;
  return DEFAULT_CLINIC_OPENING_TIME;
}

export function resolveClinicClosingTime(closingTime?: string | null): string {
  const trimmed = closingTime?.trim();
  if (trimmed && isValidClinicTimeHHmm(trimmed)) return trimmed;
  return DEFAULT_CLINIC_CLOSING_TIME;
}

export function isStartBeforeOpening(localDatetime: string, openingTime: string): boolean {
  const { time } = splitDatetimeLocal(localDatetime);
  if (!time) return false;
  return clinicTimeToMinutes(time) < clinicTimeToMinutes(openingTime);
}

export function isStartAfterClosing(localDatetime: string, closingTime: string): boolean {
  const { time } = splitDatetimeLocal(localDatetime);
  if (!time) return false;
  return clinicTimeToMinutes(time) >= clinicClosingMinutes(closingTime);
}

export function formatClinicTimeLabel(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0);
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function formatClinicHoursRange(openingTime: string, closingTime: string, locale: string): string {
  const open = formatClinicTimeLabel(openingTime, locale);
  const close =
    closingTime === "00:00"
      ? formatClinicTimeLabel("00:00", locale)
      : formatClinicTimeLabel(closingTime, locale);
  return `${open} – ${close}`;
}

export function collectClinicHoursErrors(
  openingTime: string,
  closingTime: string,
  t: (key: string, defaultValue: string) => string,
): string[] {
  const issues: string[] = [];
  if (!isValidClinicTimeHHmm(openingTime)) {
    issues.push(t("admin.errorClinicOpeningTime", "Enter a valid opening time (HH:mm)."));
  }
  if (!isValidClinicTimeHHmm(closingTime)) {
    issues.push(t("admin.errorClinicClosingTime", "Enter a valid closing time (HH:mm)."));
  }
  if (
    isValidClinicTimeHHmm(openingTime) &&
    isValidClinicTimeHHmm(closingTime) &&
    closingTime !== DEFAULT_CLINIC_CLOSING_TIME &&
    clinicTimeToMinutes(openingTime) >= clinicTimeToMinutes(closingTime)
  ) {
    issues.push(t("admin.errorClinicHoursOrder", "Opening time must be before closing time."));
  }
  return issues;
}
