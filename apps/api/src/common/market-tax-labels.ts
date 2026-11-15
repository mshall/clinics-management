/** Labels and authority names from `Market.taxConfig` — used on clinic settings and printed invoices. */

export type MarketTaxLabels = {
  taxAuthorityNameEn: string;
  taxAuthorityNameAr: string;
  taxRegistrationLabelEn: string;
  taxRegistrationLabelAr: string;
  licenseLabelEn: string;
  licenseLabelAr: string;
};

const FALLBACK: MarketTaxLabels = {
  taxAuthorityNameEn: "Tax authority",
  taxAuthorityNameAr: "جهة الضرائب",
  taxRegistrationLabelEn: "Tax authority registration number",
  taxRegistrationLabelAr: "رقم التسجيل لدى جهة الضرائب",
  licenseLabelEn: "Facility license number",
  licenseLabelAr: "رقم ترخيص المنشأة",
};

const BY_COUNTRY: Record<string, Partial<MarketTaxLabels>> = {
  EG: {
    taxAuthorityNameEn: "Egyptian Tax Authority (ETA)",
    taxAuthorityNameAr: "مصلحة الضرائب المصرية",
    taxRegistrationLabelEn: "Tax registration number (RIN / TRN)",
    taxRegistrationLabelAr: "الرقم الضريبي (RIN / TRN)",
    licenseLabelEn: "Ministry of Health facility license",
    licenseLabelAr: "رقم ترخيص المنشأة الصحية",
  },
};

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function resolveMarketTaxLabels(
  taxConfig: unknown,
  marketCode?: string | null,
): MarketTaxLabels {
  const countryFallback = marketCode ? BY_COUNTRY[marketCode.toUpperCase()] ?? {} : {};
  const base = { ...FALLBACK, ...countryFallback };
  if (!taxConfig || typeof taxConfig !== "object" || Array.isArray(taxConfig)) {
    return base;
  }
  const m = taxConfig as Record<string, unknown>;
  return {
    taxAuthorityNameEn: readString(m, "taxAuthorityNameEn") ?? base.taxAuthorityNameEn,
    taxAuthorityNameAr: readString(m, "taxAuthorityNameAr") ?? base.taxAuthorityNameAr,
    taxRegistrationLabelEn: readString(m, "taxRegistrationLabelEn") ?? base.taxRegistrationLabelEn,
    taxRegistrationLabelAr: readString(m, "taxRegistrationLabelAr") ?? base.taxRegistrationLabelAr,
    licenseLabelEn: readString(m, "licenseLabelEn") ?? base.licenseLabelEn,
    licenseLabelAr: readString(m, "licenseLabelAr") ?? base.licenseLabelAr,
  };
}