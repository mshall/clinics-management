import type { PickListItem } from "@/components/searchable-pick-list";
import type { EmployeeDto } from "@/lib/api-types";

export type EmployeeNameFields = Pick<
  EmployeeDto,
  "firstNameEn" | "lastNameEn" | "firstNameAr" | "lastNameAr" | "employeeNumber"
>;

export function formatEmployeeEnglishName(e: Pick<EmployeeNameFields, "firstNameEn" | "lastNameEn">): string {
  return `${e.firstNameEn} ${e.lastNameEn}`.trim();
}

export function formatEmployeeArabicName(e: Pick<EmployeeNameFields, "firstNameAr" | "lastNameAr">): string {
  return [e.firstNameAr, e.lastNameAr].filter(Boolean).join(" ").trim();
}

/** Locale-aware employee display name (Arabic when locale is ar and names exist). */
export function formatEmployeeName(
  e: Pick<EmployeeNameFields, "firstNameEn" | "lastNameEn" | "firstNameAr" | "lastNameAr">,
  language: string,
): string {
  const en = formatEmployeeEnglishName(e);
  const ar = formatEmployeeArabicName(e);
  if (language === "ar") return ar || en;
  return en || ar;
}

export function employeeToPickListItem(e: EmployeeNameFields & { id: string }, language: string): PickListItem {
  const label = formatEmployeeName(e, language);
  const en = formatEmployeeEnglishName(e);
  const ar = formatEmployeeArabicName(e);
  const hintParts = [e.employeeNumber];
  const alt = language === "ar" ? en : ar;
  if (alt && alt !== label) hintParts.push(alt);
  return { value: e.id, label, hint: hintParts.join(" · ") };
}

export type ClinicianNameFields = {
  clinicianName?: string | null;
  clinicianFirstNameEn?: string | null;
  clinicianLastNameEn?: string | null;
  clinicianFirstNameAr?: string | null;
  clinicianLastNameAr?: string | null;
};

export function formatClinicianDisplayName(input: ClinicianNameFields, language: string): string {
  if (input.clinicianFirstNameEn || input.clinicianLastNameEn || input.clinicianFirstNameAr || input.clinicianLastNameAr) {
    return formatEmployeeName(
      {
        firstNameEn: input.clinicianFirstNameEn ?? "",
        lastNameEn: input.clinicianLastNameEn ?? "",
        firstNameAr: input.clinicianFirstNameAr,
        lastNameAr: input.clinicianLastNameAr,
      },
      language,
    );
  }
  return input.clinicianName?.trim() || "—";
}
