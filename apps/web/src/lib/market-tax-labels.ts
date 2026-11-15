/** Client-side fallback when clinic detail omits marketTaxLabels (matches API resolveMarketTaxLabels). */
export type MarketTaxLabels = {
  taxAuthorityNameEn: string;
  taxAuthorityNameAr: string;
  taxRegistrationLabelEn: string;
  taxRegistrationLabelAr: string;
  licenseLabelEn: string;
  licenseLabelAr: string;
};

export function pickMarketTaxLabel(
  labels: MarketTaxLabels | undefined,
  field: "taxRegistration" | "license",
  language: string,
): string {
  const ar = language === "ar";
  if (!labels) {
    if (field === "taxRegistration") {
      return ar ? "رقم التسجيل لدى جهة الضرائب" : "Tax authority registration number";
    }
    return ar ? "رقم ترخيص المنشأة" : "Facility license number";
  }
  if (field === "taxRegistration") {
    return ar ? labels.taxRegistrationLabelAr : labels.taxRegistrationLabelEn;
  }
  return ar ? labels.licenseLabelAr : labels.licenseLabelEn;
}