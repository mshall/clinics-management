export type ClinicPrescriptionSettingsDto = {
  hasPrescriptionLogo: boolean;
  prescriptionHeaderDescriptionEn: string;
  prescriptionHeaderDescriptionAr: string;
};

export function clinicPrescriptionSettingsFromRow(row: {
  prescriptionLogoRelativePath: string | null;
  prescriptionHeaderDescriptionEn: string;
  prescriptionHeaderDescriptionAr: string;
}): ClinicPrescriptionSettingsDto {
  return {
    hasPrescriptionLogo: Boolean(row.prescriptionLogoRelativePath),
    prescriptionHeaderDescriptionEn: row.prescriptionHeaderDescriptionEn ?? "",
    prescriptionHeaderDescriptionAr: row.prescriptionHeaderDescriptionAr ?? "",
  };
}

export function resolvePrescriptionHeaderDescription(
  row: { prescriptionHeaderDescriptionEn: string; prescriptionHeaderDescriptionAr: string },
  locale: "en" | "ar",
): string | null {
  const en = row.prescriptionHeaderDescriptionEn?.trim() ?? "";
  const ar = row.prescriptionHeaderDescriptionAr?.trim() ?? "";
  const picked = locale === "ar" ? ar || en : en || ar;
  return picked || null;
}
