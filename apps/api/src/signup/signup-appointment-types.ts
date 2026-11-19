import { ClinicalSpecialty } from "@prisma/client";

export type SignupAppointmentTypeSeed = {
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  feeUsesTenantDefault: boolean;
  /** Multiplier on the tenant's market-derived default visit fee (default 1); clinics edit fees after signup. */
  feeFactor?: number;
};

type Seed = SignupAppointmentTypeSeed;

function seed(nameEn: string, nameAr: string, durationMinutes: number, feeFactor = 1): Seed {
  return { nameEn, nameAr, durationMinutes, feeUsesTenantDefault: true, ...(feeFactor !== 1 ? { feeFactor } : {}) };
}

const COMMON: Seed[] = [seed("Consultation", "كشف", 20), seed("Follow-up", "متابعة", 15)];

const BY_SPECIALTY: Partial<Record<ClinicalSpecialty, Seed[]>> = {
  [ClinicalSpecialty.DENTISTRY]: [
    seed("Dental check-up", "فحص أسنان", 30),
    seed("Dental follow-up", "متابعة أسنان", 20),
    seed("Scaling & polishing", "تنظيف جير وتلميع", 45, 1.5),
  ],
  [ClinicalSpecialty.PHYSIO_THERAPY]: [
    seed("Physio session", "جلسة علاج طبيعي", 45),
    seed("Physio assessment", "تقييم علاج طبيعي", 30),
  ],
  [ClinicalSpecialty.AESTHETICS]: [
    seed("Aesthetic consultation", "استشارة تجميل", 30),
    seed("Treatment session", "جلسة علاج", 45),
  ],
  [ClinicalSpecialty.DERMATOLOGY]: [
    seed("Skin consultation", "كشف جلدية", 20),
    seed("Skin follow-up", "متابعة جلدية", 15, 0.5),
    seed("Minor skin procedure", "إجراء جلدي بسيط", 30, 1.5),
  ],
  [ClinicalSpecialty.PEDIATRICS]: [
    seed("Child consultation", "كشف أطفال", 20),
    seed("Well-baby & growth check", "متابعة نمو الطفل", 20),
    seed("Pediatric follow-up", "متابعة أطفال", 15, 0.5),
  ],
  [ClinicalSpecialty.OBSTETRICS_GYNECOLOGY]: [
    seed("GYN consultation", "كشف نساء", 20),
    seed("Antenatal visit", "متابعة حمل", 20),
    seed("Ultrasound scan", "سونار", 20, 1.5),
  ],
  [ClinicalSpecialty.ORTHOPEDICS]: [
    seed("Orthopedic consultation", "كشف عظام", 20),
    seed("Orthopedic follow-up", "متابعة عظام", 15, 0.5),
    seed("Joint injection", "حقن مفصل", 20, 1.5),
  ],
  [ClinicalSpecialty.ENT]: [
    seed("ENT consultation", "كشف أنف وأذن", 20),
    seed("ENT follow-up", "متابعة أنف وأذن", 15, 0.5),
    seed("Ear cleaning / endoscopy", "تنظيف أذن / منظار", 20, 1.5),
  ],
  [ClinicalSpecialty.INTERNAL_MEDICINE]: [
    seed("Internal medicine consultation", "كشف باطنة", 20),
    seed("Chronic disease follow-up", "متابعة أمراض مزمنة", 15, 0.5),
  ],
  [ClinicalSpecialty.CARDIOLOGY]: [
    seed("Cardiology consultation", "كشف قلب", 30),
    seed("Cardiology follow-up", "متابعة قلب", 15, 0.5),
    seed("ECG / echo", "رسم قلب / إيكو", 30, 1.5),
  ],
  [ClinicalSpecialty.PSYCHIATRY]: [
    seed("Psychiatric assessment", "تقييم نفسي", 45),
    seed("Psychiatry follow-up", "متابعة نفسية", 30, 0.75),
  ],
  [ClinicalSpecialty.OPHTHALMOLOGY]: [
    seed("Eye consultation", "كشف عيون", 20),
    seed("Eye follow-up", "متابعة عيون", 15, 0.5),
    seed("Refraction / glasses check", "قياس نظر", 15),
  ],
  [ClinicalSpecialty.UROLOGY]: [
    seed("Urology consultation", "كشف مسالك", 20),
    seed("Urology follow-up", "متابعة مسالك", 15, 0.5),
    seed("Urology ultrasound", "سونار مسالك", 20, 1.5),
  ],
};

export function defaultAppointmentTypesForSpecialty(specialty: ClinicalSpecialty): SignupAppointmentTypeSeed[] {
  return [...(BY_SPECIALTY[specialty] ?? COMMON)];
}

export function hasSpecialtyAppointmentTypes(specialty: ClinicalSpecialty): boolean {
  return Boolean(BY_SPECIALTY[specialty]?.length);
}

export function seedFeeAmount(seed: SignupAppointmentTypeSeed, tenantDefaultVisitFee: number): number {
  if (!seed.feeUsesTenantDefault) return 0;
  return Math.round(tenantDefaultVisitFee * (seed.feeFactor ?? 1) * 100) / 100;
}
