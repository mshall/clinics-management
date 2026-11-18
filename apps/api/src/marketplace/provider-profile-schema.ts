import type { ClinicalSpecialty } from "@prisma/client";

export const PROVIDER_PROFILE_COMPLETENESS_MIN = 80;

export const PROVIDER_PROFILE_UPDATED_TOPIC = "PROVIDER_PROFILE_UPDATED";

export type ProviderEducationEntry = {
  degreeEn: string;
  degreeAr?: string;
  institutionEn?: string;
  institutionAr?: string;
};

export type ProviderProfileJson = {
  displayNameEn?: string;
  displayNameAr?: string;
  titleEn?: string;
  titleAr?: string;
  specialty?: ClinicalSpecialty | string;
  subSpecialties?: string[];
  gender?: "MALE" | "FEMALE" | "UNSPECIFIED";
  languages?: string[];
  bioEn?: string;
  bioAr?: string;
  education?: ProviderEducationEntry[];
  yearsExperience?: number;
  photoRelativePath?: string;
  photoOriginalName?: string;
  feesByAppointmentTypeId?: Record<string, number>;
  acceptedPayerIds?: string[];
  clinicPhotoRelativePaths?: string[];
  amenities?: string[];
  parking?: boolean;
  wheelchairAccess?: boolean;
};

export function parseProviderProfileJson(raw: unknown): ProviderProfileJson {
  if (!raw || typeof raw !== "object") return {};
  return raw as ProviderProfileJson;
}

type CompletenessInput = {
  profile: ProviderProfileJson;
  hasMarketplaceFees: boolean;
  clinicHasGeo: boolean;
  clinicHasAddress: boolean;
};

export function providerProfileCompletenessPercent(input: CompletenessInput): number {
  const p = input.profile;
  const checks: { ok: boolean; weight: number }[] = [
    { ok: Boolean(p.displayNameEn?.trim()), weight: 8 },
    { ok: Boolean(p.displayNameAr?.trim()), weight: 8 },
    { ok: Boolean(p.specialty), weight: 10 },
    { ok: Boolean(p.bioEn?.trim() && p.bioEn.trim().length >= 40), weight: 9 },
    { ok: Boolean(p.bioAr?.trim() && p.bioAr.trim().length >= 40), weight: 9 },
    { ok: Boolean(p.photoRelativePath?.trim()), weight: 12 },
    { ok: Array.isArray(p.languages) && p.languages.length > 0, weight: 6 },
    { ok: typeof p.yearsExperience === "number" && p.yearsExperience >= 0, weight: 5 },
    { ok: Array.isArray(p.education) && p.education.length > 0, weight: 5 },
    { ok: input.hasMarketplaceFees, weight: 10 },
    { ok: input.clinicHasGeo, weight: 10 },
    { ok: input.clinicHasAddress, weight: 5 },
    { ok: Array.isArray(p.amenities) && p.amenities.length > 0, weight: 3 },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  return Math.round((earned / total) * 100);
}

export function profileTriggersVerificationRereview(
  prev: ProviderProfileJson,
  next: ProviderProfileJson,
): boolean {
  const nameChanged =
    (prev.displayNameEn?.trim() ?? "") !== (next.displayNameEn?.trim() ?? "") ||
    (prev.displayNameAr?.trim() ?? "") !== (next.displayNameAr?.trim() ?? "");
  const specialtyChanged = (prev.specialty ?? "") !== (next.specialty ?? "");
  return nameChanged || specialtyChanged;
}