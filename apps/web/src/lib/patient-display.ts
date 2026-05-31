import type { PickListItem } from "@/components/searchable-pick-list";
import type { PatientDto } from "@/lib/api-schema";

type PatientNameFields = Pick<PatientDto, "firstNameEn" | "lastNameEn" | "firstNameAr" | "lastNameAr" | "mrn" | "id">;

/** Resolve a table cell label for a patient row; prefer API MRN/name over a local registry slice. */
export function resolvePatientListLabel(input: {
  patientId: string;
  patientMrn?: string | null;
  patientName?: string | null;
  /** From a cached patients query (e.g. first page only); used only when API omits name fields */
  registryLabel?: string | null;
}): { text: string; isIdFallback: boolean } {
  const mr = input.patientMrn?.trim();
  const nm = input.patientName?.trim();
  if (mr && nm) return { text: `${mr} — ${nm}`, isIdFallback: false };
  if (nm) return { text: nm, isIdFallback: false };
  if (mr) return { text: mr, isIdFallback: false };
  const reg = input.registryLabel?.trim();
  if (reg) return { text: reg, isIdFallback: false };
  return { text: `${input.patientId.slice(0, 8)}…`, isIdFallback: true };
}

export function formatPatientEnglishName(p: Pick<PatientNameFields, "firstNameEn" | "lastNameEn">): string {
  return `${p.firstNameEn} ${p.lastNameEn}`.trim();
}

export function formatPatientArabicName(p: Pick<PatientNameFields, "firstNameAr" | "lastNameAr">): string {
  return [p.firstNameAr, p.lastNameAr].filter(Boolean).join(" ").trim();
}

/** Searchable pick-list row for a patient (English label, MRN + Arabic in hint). */
export function patientToPickListItem(p: PatientNameFields): PickListItem {
  const en = formatPatientEnglishName(p);
  const ar = formatPatientArabicName(p);
  const label = en || ar || p.mrn;
  const hintParts = [p.mrn];
  if (ar) hintParts.push(ar);
  return { value: p.id, label, hint: hintParts.join(" · ") };
}
