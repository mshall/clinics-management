/** ISO 3166-1 alpha-2 options for initiating country packs (extend as you go live). */
export const MARKET_COUNTRY_OPTIONS = [
  { code: "EG", nameEn: "Egypt", nameAr: "مصر", defaultCurrency: "EGP", defaultTimezone: "Africa/Cairo" },
  { code: "AE", nameEn: "United Arab Emirates", nameAr: "الإمارات", defaultCurrency: "AED", defaultTimezone: "Asia/Dubai" },
  { code: "SA", nameEn: "Saudi Arabia", nameAr: "السعودية", defaultCurrency: "SAR", defaultTimezone: "Asia/Riyadh" },
  { code: "OM", nameEn: "Oman", nameAr: "عُمان", defaultCurrency: "OMR", defaultTimezone: "Asia/Muscat" },
  { code: "QA", nameEn: "Qatar", nameAr: "قطر", defaultCurrency: "QAR", defaultTimezone: "Asia/Qatar" },
  { code: "KW", nameEn: "Kuwait", nameAr: "الكويت", defaultCurrency: "KWD", defaultTimezone: "Asia/Kuwait" },
  { code: "BH", nameEn: "Bahrain", nameAr: "البحرين", defaultCurrency: "BHD", defaultTimezone: "Asia/Bahrain" },
  { code: "JO", nameEn: "Jordan", nameAr: "الأردن", defaultCurrency: "JOD", defaultTimezone: "Asia/Amman" },
  { code: "GB", nameEn: "United Kingdom", nameAr: "المملكة المتحدة", defaultCurrency: "GBP", defaultTimezone: "Europe/London" },
  { code: "US", nameEn: "United States", nameAr: "الولايات المتحدة", defaultCurrency: "USD", defaultTimezone: "America/New_York" },
] as const;

/** Common AWS Regions (API name → label). */
export const AWS_DATA_REGIONS = [
  { id: "eu-central-1", label: "Europe (Frankfurt)" },
  { id: "eu-west-1", label: "Europe (Ireland)" },
  { id: "me-central-1", label: "Middle East (UAE)" },
  { id: "me-south-1", label: "Middle East (Bahrain)" },
  { id: "af-south-1", label: "Africa (Cape Town)" },
  { id: "us-east-1", label: "US East (N. Virginia)" },
  { id: "us-west-2", label: "US West (Oregon)" },
] as const;

export const BASE_CURRENCY_OPTIONS = [
  "EGP",
  "AED",
  "SAR",
  "OMR",
  "QAR",
  "KWD",
  "BHD",
  "USD",
  "EUR",
  "GBP",
  "JOD",
] as const;