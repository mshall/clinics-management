/**
 * KNSVC01/02 — the Nurse service catalogue seeded from the market pack (Egypt baseline). Every service is a HOME visit type
 * (ADR-030) with 30/30 travel buffers. Durations are starting points; prices are multipliers of the tenant's default visit fee and are
 * edited by the nurse (not a published price list: NEEDS_HUMAN for any real tariff). Private-duty shifts are priced per hour and booked
 * through ShiftBooking (KNSH01), not through slots.
 */
export type NurseServiceSeed = {
  code: string;
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  feeFactor: number;
};

export const NURSE_SERVICE_CATALOGUE: readonly NurseServiceSeed[] = [
  { code: "injection", nameEn: "Injection", nameAr: "حقنة", durationMinutes: 20, feeFactor: 0.6 },
  { code: "iv_cannula_infusion", nameEn: "IV cannula / infusion", nameAr: "كانيولا / محلول وريدي", durationMinutes: 45, feeFactor: 1.2 },
  { code: "wound_dressing", nameEn: "Wound dressing", nameAr: "تغيير جرح", durationMinutes: 30, feeFactor: 0.9 },
  { code: "catheter_care", nameEn: "Catheter care", nameAr: "العناية بالقسطرة", durationMinutes: 30, feeFactor: 1 },
  { code: "vitals_monitoring", nameEn: "Vitals monitoring", nameAr: "متابعة العلامات الحيوية", durationMinutes: 20, feeFactor: 0.6 },
  { code: "post_operative_care", nameEn: "Post-operative care", nameAr: "رعاية ما بعد الجراحة", durationMinutes: 45, feeFactor: 1.3 },
  { code: "elderly_care_visit", nameEn: "Elderly-care visit", nameAr: "زيارة رعاية كبار السن", durationMinutes: 60, feeFactor: 1.5 },
  { code: "newborn_mother_care", nameEn: "Newborn and mother care", nameAr: "رعاية الأم والمولود", durationMinutes: 60, feeFactor: 1.5 },
];

export const NURSE_SHIFT_DURATIONS_HOURS = [8, 12, 24] as const;
export type ShiftHours = (typeof NURSE_SHIFT_DURATIONS_HOURS)[number];

export function isShiftHours(v: unknown): v is ShiftHours {
  return (NURSE_SHIFT_DURATIONS_HOURS as readonly unknown[]).includes(v);
}
