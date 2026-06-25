import type { TFunction } from "i18next";

export const REVENUE_CATEGORIES = [
  "VISIT",
  "VISIT_FEE",
  "PROCEDURE",
  "LAB",
  "PHARMACY",
  "IMAGING",
  "APPOINTMENT_FEE",
  "OPERATION_PAYMENT",
  "OTHER",
] as const;

export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

type ClinicNames = { nameEn: string; nameAr?: string | null; id?: string };

export function formatClinicName(c: ClinicNames, language: string): string {
  const en = c.nameEn?.trim();
  const ar = c.nameAr?.trim();
  if (language === "ar") return ar || en || c.id || "—";
  return en || ar || c.id || "—";
}

export function formatClinicNameFields(
  nameEn: string | null | undefined,
  nameAr: string | null | undefined,
  language: string,
  fallback = "—",
): string {
  const label = formatClinicName({ nameEn: nameEn ?? "", nameAr }, language);
  return label === "—" && !nameEn?.trim() && !nameAr?.trim() ? fallback : label;
}

export function formatRevenueCategory(category: string, t: TFunction): string {
  const key = `revenue.categories.${category}`;
  const translated = t(key);
  return translated === key ? category : translated;
}

export function formatRevenueStatus(status: string, t: TFunction): string {
  const key = `revenue.statuses.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatExpenseCategory(category: string, t: TFunction): string {
  const key = `expenses.categories.${category}`;
  const translated = t(key);
  return translated === key ? category : translated;
}

export function formatExpenseStatus(status: string, t: TFunction): string {
  const key = `expenses.statuses.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatEncounterStatus(status: string, t: TFunction): string {
  const map: Record<string, string> = {
    DRAFT: t("encounters.statusDraft"),
    AMENDED: t("encounters.statusAmended"),
    FINALIZED: t("encounters.statusFinalized"),
  };
  return map[status] ?? status;
}

export function formatGender(gender: string, t: TFunction): string {
  const map: Record<string, string> = {
    M: t("patients.genderM"),
    F: t("patients.genderF"),
    OTHER: t("patients.genderOther"),
    UNKNOWN: t("patients.genderUnknown"),
  };
  return map[gender] ?? gender;
}

export function formatUserRole(role: string, t: TFunction): string {
  const normalized = role.toLowerCase();
  const key = `roles.${normalized}`;
  const translated = t(key);
  return translated === key ? role.replace(/_/g, " ") : translated;
}

export function formatAttendanceStatus(status: string, t: TFunction): string {
  const key = `hr.attendanceStatuses.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatLeaveStatus(status: string, t: TFunction): string {
  const key = `hr.leaveStatuses.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatEmploymentType(type: string, t: TFunction): string {
  const key = `hr.employmentTypes.${type}`;
  const translated = t(key);
  return translated === key ? type.replace(/_/g, " ") : translated;
}

export function formatLeaveType(type: string, t: TFunction): string {
  const key = `hr.leaveTypes.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}

export function localeForLanguage(language: string): string {
  return language === "ar" ? "ar-AE" : "en-AE";
}

/** Whole years from an ISO date (YYYY-MM-DD) to today; null if invalid or in the future. */
export function calculateAgeFromDob(dobIso: string, refDate: Date = new Date()): number | null {
  const trimmed = dobIso.trim();
  if (!trimmed) return null;
  const dob = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  let age = refDate.getFullYear() - dob.getFullYear();
  const monthDiff = refDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function formatPatientDob(dobIso: string, locale: string): string {
  const dob = new Date(dobIso.includes("T") ? dobIso : `${dobIso}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return dobIso;
  return dob.toLocaleDateString(locale);
}
