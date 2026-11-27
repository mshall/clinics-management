/**
 * ISO 3166-1 alpha-2 options for initiating country packs (extend as you go live). Every row carries ALL the values the API requires, so the form can
 * pre-fill them (founder decision C, 27 Nov 2026). They are editable starting values, not legal claims. Weekend days use JS numbering (0 = Sunday).
 * `apps/api/src/markets/market-country-defaults.ts` holds the same table; a node test keeps them equal.
 */
export const MARKET_COUNTRY_OPTIONS = [
  { code: "EG", nameEn: "Egypt", nameAr: "مصر", defaultCurrency: "EGP", defaultTimezone: "Africa/Cairo", defaultLocale: "ar-EG", defaultPhoneRegion: "EG", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "AE", nameEn: "United Arab Emirates", nameAr: "الإمارات", defaultCurrency: "AED", defaultTimezone: "Asia/Dubai", defaultLocale: "ar-AE", defaultPhoneRegion: "AE", weekendDays: [6, 0], enabledLanguages: ["ar", "en"] },
  { code: "SA", nameEn: "Saudi Arabia", nameAr: "السعودية", defaultCurrency: "SAR", defaultTimezone: "Asia/Riyadh", defaultLocale: "ar-SA", defaultPhoneRegion: "SA", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "OM", nameEn: "Oman", nameAr: "عُمان", defaultCurrency: "OMR", defaultTimezone: "Asia/Muscat", defaultLocale: "ar-OM", defaultPhoneRegion: "OM", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "QA", nameEn: "Qatar", nameAr: "قطر", defaultCurrency: "QAR", defaultTimezone: "Asia/Qatar", defaultLocale: "ar-QA", defaultPhoneRegion: "QA", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "KW", nameEn: "Kuwait", nameAr: "الكويت", defaultCurrency: "KWD", defaultTimezone: "Asia/Kuwait", defaultLocale: "ar-KW", defaultPhoneRegion: "KW", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "BH", nameEn: "Bahrain", nameAr: "البحرين", defaultCurrency: "BHD", defaultTimezone: "Asia/Bahrain", defaultLocale: "ar-BH", defaultPhoneRegion: "BH", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "JO", nameEn: "Jordan", nameAr: "الأردن", defaultCurrency: "JOD", defaultTimezone: "Asia/Amman", defaultLocale: "ar-JO", defaultPhoneRegion: "JO", weekendDays: [5, 6], enabledLanguages: ["ar", "en"] },
  { code: "GB", nameEn: "United Kingdom", nameAr: "المملكة المتحدة", defaultCurrency: "GBP", defaultTimezone: "Europe/London", defaultLocale: "en-GB", defaultPhoneRegion: "GB", weekendDays: [6, 0], enabledLanguages: ["en"] },
  { code: "US", nameEn: "United States", nameAr: "الولايات المتحدة", defaultCurrency: "USD", defaultTimezone: "America/New_York", defaultLocale: "en-US", defaultPhoneRegion: "US", weekendDays: [6, 0], enabledLanguages: ["en"] },
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