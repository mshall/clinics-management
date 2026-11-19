/** UX-03 — optional Eastern Arabic-Indic digits when UI language is Arabic. */

const STORAGE_KEY = "kiorly.arabicNumerals";

export type NumeralPreference = "latn" | "arab";

export function readArabicNumeralsPreference(): NumeralPreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "arab" || v === "latn") return v;
  } catch {
    /* ignore */
  }
  return "latn";
}

export function persistArabicNumeralsPreference(pref: NumeralPreference) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.numerals = pref;
  }
}

export function applyNumeralPreferenceToDocument(pref: NumeralPreference = readArabicNumeralsPreference()) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.numerals = pref;
}

/** BCP-47 locale for number/date formatting with optional Arabic-Indic digits. */
export function localeWithNumerals(language: string, pref: NumeralPreference = readArabicNumeralsPreference()): string {
  if (language === "ar" && pref === "arab") return "ar-EG-u-nu-arab";
  if (language === "ar") return "ar-EG-u-nu-latn";
  return language === "ar" ? "ar-EG" : "en-GB";
}

export function formatNumberLocalized(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions,
  pref: NumeralPreference = readArabicNumeralsPreference(),
): string {
  return new Intl.NumberFormat(localeWithNumerals(language, pref), options).format(value);
}
