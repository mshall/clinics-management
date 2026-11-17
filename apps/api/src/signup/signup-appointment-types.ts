import { ClinicalSpecialty } from "@prisma/client";

export type SignupAppointmentTypeSeed = {
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  feeUsesTenantDefault: boolean;
};

const COMMON: SignupAppointmentTypeSeed[] = [
  { nameEn: "Consultation", nameAr: "كشف", durationMinutes: 20, feeUsesTenantDefault: true },
  { nameEn: "Follow-up", nameAr: "متابعة", durationMinutes: 15, feeUsesTenantDefault: true },
];

const BY_SPECIALTY: Partial<Record<ClinicalSpecialty, SignupAppointmentTypeSeed[]>> = {
  [ClinicalSpecialty.DENTISTRY]: [
    { nameEn: "Dental check-up", nameAr: "فحص أسنان", durationMinutes: 30, feeUsesTenantDefault: true },
    { nameEn: "Dental follow-up", nameAr: "متابعة أسنان", durationMinutes: 20, feeUsesTenantDefault: true },
  ],
  [ClinicalSpecialty.PHYSIO_THERAPY]: [
    { nameEn: "Physio session", nameAr: "جلسة علاج طبيعي", durationMinutes: 45, feeUsesTenantDefault: true },
    { nameEn: "Physio assessment", nameAr: "تقييم علاج طبيعي", durationMinutes: 30, feeUsesTenantDefault: true },
  ],
  [ClinicalSpecialty.AESTHETICS]: [
    { nameEn: "Aesthetic consultation", nameAr: "استشارة تجميل", durationMinutes: 30, feeUsesTenantDefault: true },
    { nameEn: "Treatment session", nameAr: "جلسة علاج", durationMinutes: 45, feeUsesTenantDefault: true },
  ],
};

export function defaultAppointmentTypesForSpecialty(specialty: ClinicalSpecialty): SignupAppointmentTypeSeed[] {
  return [...(BY_SPECIALTY[specialty] ?? COMMON)];
}