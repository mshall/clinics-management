import type { AppLocale } from "@/lib/i18n";

export const LOCALE_COOKIE_NAME = "cms_locale";
const LOCALE_STORAGE_KEY = "cms_locale";
/** 400 days — persist across return visits without expiring too aggressively. */
const COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((c) => c.trim());
  const prefix = `${name}=`;
  const hit = parts.find((c) => c.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

/** Preferred locale from cookie, then legacy localStorage, then English. */
export function readStoredLocale(): AppLocale {
  const fromCookie = readCookie(LOCALE_COOKIE_NAME);
  if (fromCookie === "en" || fromCookie === "ar") return fromCookie;
  try {
    const fromStorage = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (fromStorage === "en" || fromStorage === "ar") return fromStorage;
  } catch {
    /* ignore */
  }
  return "en";
}

export function persistLocale(lng: AppLocale): void {
  writeCookie(LOCALE_COOKIE_NAME, lng);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
}
