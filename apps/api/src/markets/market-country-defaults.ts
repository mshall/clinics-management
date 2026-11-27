/**
 * Per-country starting values for "Initiate country launch" (founder decision C, 27 Nov 2026). They are EDITABLE DEFAULTS that save typing,
 * not legal or regulatory claims: counsel and the market pack decide the real values. Weekend days use JS getDay numbering (0 = Sunday).
 * The web form carries the same table (`apps/web/src/lib/market-pack-options.ts`); a node test keeps the two in step.
 */
import { BASE_CURRENCIES } from "../common/base-currencies";
import { loadDataCellsRegistry } from "./data-cells";

export type MarketCountryDefaults = {
  code: string;
  nameEn: string;
  nameAr: string;
  defaultCurrency: string;
  defaultTimezone: string;
  defaultLocale: string;
  defaultPhoneRegion: string;
  weekendDays: number[];
  enabledLanguages: string[];
};

export const MARKET_COUNTRY_DEFAULTS: readonly MarketCountryDefaults[] = [
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
];

export function countryDefaultsFor(code: string | null | undefined): MarketCountryDefaults | null {
  const cc = code?.trim().toUpperCase() ?? "";
  return MARKET_COUNTRY_DEFAULTS.find((c) => c.code === cc) ?? null;
}

export type MarketFieldIssue = { field: string; code: string; message: string };

const ISO2 = /^[A-Z]{2}$/;
const LOCALE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const LANG = /^[a-z]{2,3}$/;
const AWS_REGION = /^[a-z]{2}-[a-z]+-\d$/;
const CELL = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type MarketCreateInput = {
  code?: unknown;
  nameEn?: unknown;
  nameAr?: unknown;
  defaultCurrency?: unknown;
  defaultTimezone?: unknown;
  defaultLocale?: unknown;
  defaultPhoneRegion?: unknown;
  weekendDays?: unknown;
  enabledLanguages?: unknown;
  dataRegion?: unknown;
  hostCell?: unknown;
};

export type NormalizedMarketCreate = {
  code: string;
  nameEn: string;
  nameAr: string;
  defaultCurrency: string;
  defaultTimezone: string;
  defaultLocale: string;
  defaultPhoneRegion: string;
  weekendDays: number[];
  enabledLanguages: string[];
  dataRegion: string;
  hostCell: string;
};

/** The registry cell that lives in an AWS region (eu-central-1 -> frankfurt); an unregistered region keeps its own id, which Go live then reports as HOST_CELL_UNKNOWN. */
export function cellForRegion(region: string): string {
  try {
    const cells = loadDataCellsRegistry().cells;
    const hit = Object.entries(cells).find(([, c]) => c.awsRegion === region && c.status !== "prepared-not-deployed");
    return hit?.[0] ?? region;
  } catch {
    return region;
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Normalise and validate a market creation body. Missing locale, phone region, weekend days, languages, currency and timezone are filled from the
 * country table when the country is known (so an older client that omits them still works); an unknown country must supply every value.
 * Returns issues (never throws) so the caller can answer with one structured 400.
 */
export function normalizeMarketCreate(input: MarketCreateInput): { value?: NormalizedMarketCreate; issues: MarketFieldIssue[] } {
  const issues: MarketFieldIssue[] = [];
  const bad = (field: string, code: string, message: string) => issues.push({ field, code, message });
  const code = str(input.code).toUpperCase();
  if (!ISO2.test(code)) bad("code", "MARKET_CODE_INVALID", "Country code must be two letters (ISO 3166-1 alpha-2)");
  const d = countryDefaultsFor(code);
  const nameEn = str(input.nameEn) || d?.nameEn || "";
  if (!nameEn) bad("nameEn", "NAME_REQUIRED", "English name is required");
  else if (nameEn.length > 200) bad("nameEn", "NAME_TOO_LONG", "English name is at most 200 characters");
  const nameAr = str(input.nameAr) || d?.nameAr || "";
  if (nameAr.length > 200) bad("nameAr", "NAME_TOO_LONG", "Arabic name is at most 200 characters");

  const defaultCurrency = (str(input.defaultCurrency) || d?.defaultCurrency || "").toUpperCase();
  if (!defaultCurrency) bad("defaultCurrency", "CURRENCY_REQUIRED", "Currency is required");
  else if (!(BASE_CURRENCIES as readonly string[]).includes(defaultCurrency)) bad("defaultCurrency", "CURRENCY_INVALID", `Currency ${defaultCurrency} is not supported`);

  const defaultTimezone = str(input.defaultTimezone) || d?.defaultTimezone || "";
  if (!defaultTimezone) bad("defaultTimezone", "TIMEZONE_REQUIRED", "Timezone is required");
  else if (!isValidIanaTimezone(defaultTimezone)) bad("defaultTimezone", "TIMEZONE_INVALID", "Timezone must be an IANA name such as Africa/Cairo");

  const defaultLocale = str(input.defaultLocale) || d?.defaultLocale || "";
  if (!defaultLocale) bad("defaultLocale", "LOCALE_REQUIRED", "Locale is required");
  else if (!LOCALE.test(defaultLocale)) bad("defaultLocale", "LOCALE_INVALID", "Locale must look like ar-EG or en-GB");

  const defaultPhoneRegion = (str(input.defaultPhoneRegion) || d?.defaultPhoneRegion || "").toUpperCase();
  if (!defaultPhoneRegion) bad("defaultPhoneRegion", "PHONE_REGION_REQUIRED", "Phone region is required");
  else if (!ISO2.test(defaultPhoneRegion)) bad("defaultPhoneRegion", "PHONE_REGION_INVALID", "Phone region must be two letters such as EG");

  let weekendDays = d?.weekendDays ?? [];
  if (input.weekendDays !== undefined) {
    const w = input.weekendDays;
    if (!Array.isArray(w) || w.length < 1 || w.length > 3 || !w.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) || new Set(w).size !== w.length) {
      bad("weekendDays", "WEEKEND_DAYS_INVALID", "Weekend days must be 1 to 3 different numbers from 0 (Sunday) to 6 (Saturday)");
    } else weekendDays = w as number[];
  } else if (!weekendDays.length) bad("weekendDays", "WEEKEND_DAYS_REQUIRED", "Weekend days are required");

  let enabledLanguages = d?.enabledLanguages ?? [];
  if (input.enabledLanguages !== undefined) {
    const l = input.enabledLanguages;
    if (!Array.isArray(l) || l.length < 1 || l.length > 6 || !l.every((x) => typeof x === "string" && LANG.test(x)) || new Set(l).size !== l.length) {
      bad("enabledLanguages", "LANGUAGES_INVALID", "Languages must be 1 to 6 different two- or three-letter codes such as ar, en");
    } else enabledLanguages = l as string[];
  } else if (!enabledLanguages.length) bad("enabledLanguages", "LANGUAGES_REQUIRED", "Enabled languages are required");

  const dataRegion = str(input.dataRegion) || "eu-central-1";
  if (!AWS_REGION.test(dataRegion)) bad("dataRegion", "DATA_REGION_INVALID", "Data region must look like eu-central-1");
  const hostCell = str(input.hostCell) || cellForRegion(dataRegion);
  if (!CELL.test(hostCell)) bad("hostCell", "HOST_CELL_INVALID", "Host cell may use lower-case letters, digits and hyphens only");

  if (issues.length) return { issues };
  return { issues, value: { code, nameEn, nameAr, defaultCurrency, defaultTimezone, defaultLocale, defaultPhoneRegion, weekendDays, enabledLanguages, dataRegion, hostCell } };
}
