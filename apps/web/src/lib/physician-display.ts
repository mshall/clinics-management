import type { PickListItem } from "@/components/searchable-pick-list";
import type { ClinicPhysicianDto } from "@/lib/api-types";
import { formatEmployeeArabicName, formatEmployeeEnglishName, formatEmployeeName } from "@/lib/employee-display";

export function physicianToPickListItem(physician: ClinicPhysicianDto, language: string): PickListItem {
  const label = formatEmployeeName(
    {
      firstNameEn: physician.firstNameEn ?? "",
      lastNameEn: physician.lastNameEn ?? "",
      firstNameAr: physician.firstNameAr,
      lastNameAr: physician.lastNameAr,
    },
    language,
  ) || physician.displayName;
  const en = formatEmployeeEnglishName({
    firstNameEn: physician.firstNameEn ?? "",
    lastNameEn: physician.lastNameEn ?? "",
  });
  const ar = formatEmployeeArabicName({
    firstNameAr: physician.firstNameAr,
    lastNameAr: physician.lastNameAr,
  });
  const hintParts: string[] = [];
  const alt = language === "ar" ? en : ar;
  if (alt && alt !== label) hintParts.push(alt);
  if (physician.email?.trim()) hintParts.push(physician.email.trim());
  return { value: physician.userId, label, hint: hintParts.join(" · ") || undefined };
}
