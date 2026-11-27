import { MARKET_COUNTRY_OPTIONS } from "../../lib/market-pack-options";

/** Pure helpers of the Market launch screen (unit tested). */
export type LaunchForm = {
  code: string;
  nameEn: string;
  nameAr: string;
  dataRegion: string;
  hostCell: string;
  defaultCurrency: string;
  defaultTimezone: string;
  defaultLocale: string;
  defaultPhoneRegion: string;
  weekendDays: number[];
  enabledLanguages: string[];
};

export type LaunchFormField = "code" | "nameEn" | "currency" | "timezone" | "locale" | "phoneRegion" | "weekend" | "languages" | "region" | "hostCell";

/** Host cells the Clinic registry knows (platform/data-cells.json). Any other region keeps the region id as the cell and is flagged by the API at Go live. */
export const KNOWN_CELL_FOR_REGION: Record<string, string> = { "eu-central-1": "frankfurt", "me-south-1": "cairo" };

export function hostCellForRegion(region: string): string {
  return KNOWN_CELL_FOR_REGION[region] ?? region;
}

export function emptyLaunchForm(): LaunchForm {
  return { code: "", nameEn: "", nameAr: "", dataRegion: "eu-central-1", hostCell: "frankfurt", defaultCurrency: "", defaultTimezone: "", defaultLocale: "", defaultPhoneRegion: "", weekendDays: [], enabledLanguages: [] };
}

/** Choosing a country fills every field the API requires. Region and cell are kept (they are a deployment choice). */
export function applyCountry(form: LaunchForm, code: string): LaunchForm {
  const c = MARKET_COUNTRY_OPTIONS.find((x) => x.code === code);
  if (!c) return { ...emptyLaunchForm(), dataRegion: form.dataRegion, hostCell: form.hostCell };
  return {
    ...form,
    code: c.code,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    defaultCurrency: c.defaultCurrency,
    defaultTimezone: c.defaultTimezone,
    defaultLocale: c.defaultLocale,
    defaultPhoneRegion: c.defaultPhoneRegion,
    weekendDays: [...c.weekendDays],
    enabledLanguages: [...c.enabledLanguages],
  };
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateLaunchForm(f: LaunchForm): Partial<Record<LaunchFormField, true>> {
  const bad: Partial<Record<LaunchFormField, true>> = {};
  if (!/^[A-Z]{2}$/.test(f.code.trim().toUpperCase())) bad.code = true;
  if (!f.nameEn.trim() || f.nameEn.trim().length > 200) bad.nameEn = true;
  if (!f.defaultCurrency.trim()) bad.currency = true;
  if (!isValidTimezone(f.defaultTimezone.trim())) bad.timezone = true;
  if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(f.defaultLocale.trim())) bad.locale = true;
  if (!/^[A-Z]{2}$/.test(f.defaultPhoneRegion.trim().toUpperCase())) bad.phoneRegion = true;
  if (f.weekendDays.length < 1 || f.weekendDays.length > 3) bad.weekend = true;
  if (f.enabledLanguages.length < 1) bad.languages = true;
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(f.dataRegion.trim())) bad.region = true;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(f.hostCell.trim())) bad.hostCell = true;
  return bad;
}

export function toCreateBody(f: LaunchForm) {
  return {
    code: f.code.trim().toUpperCase(),
    nameEn: f.nameEn.trim(),
    nameAr: f.nameAr.trim() || undefined,
    dataRegion: f.dataRegion.trim(),
    hostCell: f.hostCell.trim(),
    defaultCurrency: f.defaultCurrency.trim().toUpperCase(),
    defaultTimezone: f.defaultTimezone.trim(),
    defaultLocale: f.defaultLocale.trim(),
    defaultPhoneRegion: f.defaultPhoneRegion.trim().toUpperCase(),
    weekendDays: [...f.weekendDays].sort((a, b) => a - b),
    enabledLanguages: [...f.enabledLanguages],
  };
}

export type TransitionKind = "LAUNCH" | "PAUSE" | "DISABLE" | "ENABLE";

export function transitionPath(kind: TransitionKind): string {
  return { LAUNCH: "launch", PAUSE: "pause", DISABLE: "disable", ENABLE: "enable" }[kind];
}

export type TransitionFormInput = { reason: string; approvalRef: string; approvalLink: string; days: string };

/** Local validation mirrors the API so the person sees the problem before a round trip. Returns an error code of the strings bundle, or null. */
export function validateTransition(kind: TransitionKind, i: TransitionFormInput): string | null {
  const reason = i.reason.trim();
  if (reason.length < 3) return "REASON_REQUIRED";
  if (reason.length > 1000) return "REASON_TOO_LONG";
  if (i.approvalRef.trim().length > 128) return "APPROVAL_REF_INVALID";
  if (i.approvalLink.trim()) {
    try {
      if (new URL(i.approvalLink.trim()).protocol !== "https:") return "APPROVAL_LINK_INVALID";
    } catch {
      return "APPROVAL_LINK_INVALID";
    }
  }
  if (kind === "PAUSE") {
    const n = Number(i.days);
    if (!/^\d+$/.test(i.days.trim()) || !Number.isInteger(n) || n < 1 || n > 365) return "PAUSE_DAYS_INVALID";
  }
  return null;
}

export function toTransitionBody(kind: TransitionKind, i: TransitionFormInput) {
  return {
    reason: i.reason.trim(),
    ...(i.approvalRef.trim() ? { approvalRef: i.approvalRef.trim() } : {}),
    ...(i.approvalLink.trim() ? { approvalLink: i.approvalLink.trim() } : {}),
    ...(kind === "PAUSE" ? { days: Number(i.days) } : {}),
  };
}

/** The API answers `{ code, message }`; the code selects the translated text, the message is the fallback. */
export function errorCodeOf(e: unknown): string | null {
  const body = (e as { body?: unknown } | null)?.body as { code?: unknown; message?: unknown } | undefined;
  if (body && typeof body.code === "string") return body.code;
  if (body && typeof body.message === "object" && body.message && typeof (body.message as { code?: unknown }).code === "string") return (body.message as { code: string }).code;
  return null;
}

export function messageForError(e: unknown, errors: Record<string, unknown>, fallback: string, generic: string): string {
  const code = errorCodeOf(e);
  if (code && typeof errors[code] === "string") return errors[code] as string;
  const raw = (e as { message?: unknown } | null)?.message;
  if (typeof raw === "string" && raw.trim() && raw !== "Request failed") return raw.length > 300 ? generic : raw;
  return fallback || generic;
}

export type ReadinessLike = {
  taxPack: { ok: boolean };
  crossBorder: { required: boolean; approved: boolean };
  hostCellKnown: boolean;
  blockers: Array<{ code: string; message: string }>;
  canLaunch: boolean;
};
