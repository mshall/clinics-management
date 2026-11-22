import type { Gender, PatientAcquisitionChannel, Prisma } from "@prisma/client";

/** Demographics that can be preferred from source or target during a patient merge. */
export const PATIENT_MERGE_FIELD_KEYS = [
  "firstNameEn",
  "lastNameEn",
  "firstNameAr",
  "lastNameAr",
  "phone",
  "email",
  "nationalId",
  "dob",
  "gender",
  "homeBranchId",
  "acquisitionChannel",
  "acquisitionReferralName",
  "acquisitionOtherDetail",
  "isVip",
  "needsChaperone",
] as const;

export type PatientMergeFieldKey = (typeof PATIENT_MERGE_FIELD_KEYS)[number];

export type PatientMergeFieldChoice = "target" | "source";

export type PatientMergeFieldChoices = Partial<Record<PatientMergeFieldKey, PatientMergeFieldChoice>>;

export type PatientMergeSnapshot = {
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  phone: string;
  email: string | null;
  nationalId: string | null;
  dob: Date | null;
  gender: Gender;
  homeBranchId: string | null;
  acquisitionChannel: PatientAcquisitionChannel | null;
  acquisitionReferralName: string | null;
  acquisitionOtherDetail: string | null;
  isVip: boolean;
  needsChaperone: boolean;
};

export function isPatientMergeFieldKey(key: string): key is PatientMergeFieldKey {
  return (PATIENT_MERGE_FIELD_KEYS as readonly string[]).includes(key);
}

function isEmptyMergeValue(key: PatientMergeFieldKey, value: unknown): boolean {
  if (key === "isVip" || key === "needsChaperone" || key === "gender") return false;
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  return false;
}

/**
 * Prefer source only when the target field is empty/missing and the source has a value.
 * Used as the default merge policy so the richer chart stays and gaps are filled.
 */
export function patientMergeFillEmptyChoices(
  target: PatientMergeSnapshot,
  source: PatientMergeSnapshot,
): PatientMergeFieldChoices {
  const choices: PatientMergeFieldChoices = {};
  for (const key of PATIENT_MERGE_FIELD_KEYS) {
    if (key === "isVip" || key === "needsChaperone" || key === "gender") continue;
    if (isEmptyMergeValue(key, target[key]) && !isEmptyMergeValue(key, source[key])) {
      choices[key] = "source";
    }
  }
  return choices;
}

/** Heuristic: more filled demographics + optional related-row counts → keep as merge target. */
export function patientMergeRichnessScore(
  patient: PatientMergeSnapshot,
  relatedCounts?: { documents?: number; encounters?: number; appointments?: number; operations?: number },
): number {
  let score = 0;
  for (const key of PATIENT_MERGE_FIELD_KEYS) {
    if (key === "isVip" || key === "needsChaperone") {
      if (patient[key]) score += 2;
      continue;
    }
    if (key === "gender") continue;
    if (!isEmptyMergeValue(key, patient[key])) score += key === "nationalId" || key === "dob" ? 3 : 1;
  }
  score += (relatedCounts?.documents ?? 0) * 5;
  score += (relatedCounts?.encounters ?? 0) * 4;
  score += (relatedCounts?.appointments ?? 0) * 3;
  score += (relatedCounts?.operations ?? 0) * 4;
  return score;
}

/** Build Prisma update data for target from field choices (source values when preferred). */
export function patientMergeTargetUpdateData(
  target: PatientMergeSnapshot,
  source: PatientMergeSnapshot,
  choices: PatientMergeFieldChoices | undefined,
): Prisma.PatientUpdateInput {
  const effective = choices && Object.keys(choices).length > 0 ? choices : patientMergeFillEmptyChoices(target, source);
  if (!Object.keys(effective).length) return {};
  const data: Prisma.PatientUpdateInput = {};
  for (const key of PATIENT_MERGE_FIELD_KEYS) {
    if (effective[key] !== "source") continue;
    switch (key) {
      case "firstNameEn":
        data.firstNameEn = source.firstNameEn;
        break;
      case "lastNameEn":
        data.lastNameEn = source.lastNameEn;
        break;
      case "firstNameAr":
        data.firstNameAr = source.firstNameAr;
        break;
      case "lastNameAr":
        data.lastNameAr = source.lastNameAr;
        break;
      case "phone":
        data.phone = source.phone;
        break;
      case "email":
        data.email = source.email;
        break;
      case "nationalId":
        data.nationalId = source.nationalId;
        break;
      case "dob":
        data.dob = source.dob;
        break;
      case "gender":
        data.gender = source.gender;
        break;
      case "homeBranchId":
        data.homeBranch = source.homeBranchId
          ? { connect: { id: source.homeBranchId } }
          : { disconnect: true };
        break;
      case "acquisitionChannel":
        data.acquisitionChannel = source.acquisitionChannel;
        break;
      case "acquisitionReferralName":
        data.acquisitionReferralName = source.acquisitionReferralName;
        break;
      case "acquisitionOtherDetail":
        data.acquisitionOtherDetail = source.acquisitionOtherDetail;
        break;
      case "isVip":
        data.isVip = source.isVip;
        break;
      case "needsChaperone":
        data.needsChaperone = source.needsChaperone;
        break;
      default: {
        const _exhaustive: never = key;
        void _exhaustive;
      }
    }
  }
  return data;
}
