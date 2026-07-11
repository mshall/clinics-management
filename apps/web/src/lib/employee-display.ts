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

/** Mirrors server `jobTitleForRole` in clinic-staff-employee.ts */
export function jobTitleForRole(role: string): string {
  switch (role.toUpperCase()) {
    case "PHYSICIAN":
      return "Physician";
    case "NURSE":
      return "Nurse";
    case "RECEPTIONIST":
      return "Receptionist";
    case "CLINIC_ASSISTANT":
      return "Clinic Assistant";
    case "BRANCH_MANAGER":
      return "Branch Manager";
    case "CLINIC_ADMIN":
      return "Clinic Administrator";
    case "GROUP_ADMIN":
      return "Group Administrator";
    case "GROUP_SUPERVISOR":
      return "Group Supervisor";
    case "CALL_CENTER":
      return "Call Center";
    case "HR_OFFICER":
      return "HR Officer";
    case "FINANCE_OFFICER":
      return "Finance Officer";
    default:
      return "Staff";
  }
}

export function splitDisplayName(displayName: string): { firstNameEn: string; lastNameEn: string } {
  const parts = displayName.trim().split(/\s+/);
  const firstNameEn = parts[0] ?? displayName;
  const lastNameEn = parts.slice(1).join(" ") || "Staff";
  return { firstNameEn, lastNameEn };
}
