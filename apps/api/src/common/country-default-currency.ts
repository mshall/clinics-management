/** Map ISO country code to default billing currency for new clinics/tenants. */
const COUNTRY_CURRENCY: Record<string, string> = {
  EG: "EGP",
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  KW: "KWD",
  BH: "BHD",
  OM: "OMR",
  JO: "JOD",
  LB: "LBP",
  US: "USD",
  GB: "GBP",
  EU: "EUR",
};

export function defaultCurrencyForCountry(countryCode: string | null | undefined): string {
  const cc = countryCode?.trim().toUpperCase() ?? "";
  return COUNTRY_CURRENCY[cc] ?? "EGP";
}