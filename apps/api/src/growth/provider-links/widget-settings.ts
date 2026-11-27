import { widgetBaseUrl } from "../../config/host-config";
import { WIDGET_MAX_ORIGINS, isValidWidgetOrigin } from "../acquisition-contract";

/** Widget origin rule, identical to the contract (`isValidWidgetOrigin`): exact https origin, host with a dot, optional port, no path, no wildcard, at most 10. */
export type OriginProblem = "NOT_HTTPS" | "WILDCARD" | "HAS_PATH" | "MALFORMED" | "DUPLICATE" | "TOO_MANY";

export type OriginsResult = { ok: true; origins: string[] } | { ok: false; reason: OriginProblem; origin?: string };

export function validateWidgetOrigins(input: unknown): OriginsResult {
  if (input === undefined || input === null) return { ok: true, origins: [] };
  if (!Array.isArray(input)) return { ok: false, reason: "MALFORMED" };
  if (input.length > WIDGET_MAX_ORIGINS) return { ok: false, reason: "TOO_MANY" };
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false, reason: "MALFORMED" };
    const origin = raw.trim().toLowerCase();
    if (origin.includes("*")) return { ok: false, reason: "WILDCARD", origin: raw };
    if (!origin.startsWith("https://")) return { ok: false, reason: "NOT_HTTPS", origin: raw };
    if (/^https:\/\/[^/]+\/./.test(origin) || origin.includes("?") || origin.includes("#")) return { ok: false, reason: "HAS_PATH", origin: raw };
    const bare = origin.replace(/\/$/, "");
    if (!isValidWidgetOrigin(bare)) return { ok: false, reason: "MALFORMED", origin: raw };
    if (seen.has(bare)) return { ok: false, reason: "DUPLICATE", origin: raw };
    seen.add(bare);
  }
  return { ok: true, origins: [...seen] };
}

export interface WidgetSettings {
  brandColor: string | null;
  languages: ("ar" | "en")[];
  /** Empty = every listed doctor of the clinic. */
  doctorIds: string[];
  /** Empty = every branch of the organisation. */
  branchIds: string[];
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = { brandColor: null, languages: ["ar", "en"], doctorIds: [], branchIds: [] };

export function parseWidgetSettings(raw: unknown): WidgetSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const langs = Array.isArray(r.languages) ? r.languages.filter((l): l is "ar" | "en" => l === "ar" || l === "en") : [];
  return {
    brandColor: typeof r.brandColor === "string" && /^#[0-9a-fA-F]{6}$/.test(r.brandColor) ? r.brandColor.toLowerCase() : null,
    languages: langs.length ? [...new Set(langs)] : ["ar", "en"],
    doctorIds: Array.isArray(r.doctorIds) ? r.doctorIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [],
    branchIds: Array.isArray(r.branchIds) ? r.branchIds.filter((x): x is string => typeof x === "string").slice(0, 50) : [],
  };
}

export type SettingsResult = { ok: true; settings: WidgetSettings } | { ok: false; field: string };

export function validateWidgetSettings(input: unknown): SettingsResult {
  if (input === undefined || input === null) return { ok: true, settings: { ...DEFAULT_WIDGET_SETTINGS } };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, field: "settings" };
  const r = input as Record<string, unknown>;
  if (r.brandColor !== undefined && r.brandColor !== null && !(typeof r.brandColor === "string" && /^#[0-9a-fA-F]{6}$/.test(r.brandColor))) return { ok: false, field: "brandColor" };
  if (r.languages !== undefined && !(Array.isArray(r.languages) && r.languages.length > 0 && r.languages.every((l) => l === "ar" || l === "en"))) return { ok: false, field: "languages" };
  for (const k of ["doctorIds", "branchIds"] as const) {
    const v = r[k];
    if (v !== undefined && !(Array.isArray(v) && v.length <= (k === "doctorIds" ? 100 : 50) && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64))) return { ok: false, field: k };
  }
  return { ok: true, settings: parseWidgetSettings(r) };
}

/** Embed snippets. The widget host is PROPOSED (`book.kiorex.com`, NEEDS_HUMAN) and comes from KIOREX_WIDGET_BASE_URL. Only public slugs appear in them. */
export function widgetSnippets(input: { slug: string; locale: "ar" | "en"; doctorSlug?: string | null; baseUrl?: string }) {
  const base = (input.baseUrl ?? widgetBaseUrl()).replace(/\/+$/, "");
  const slug = encodeURIComponent(input.slug);
  const doctor = input.doctorSlug ? ` data-doctor="${encodeURIComponent(input.doctorSlug)}"` : "";
  return {
    baseUrl: base,
    script: `<script src="${base}/v1/sdk.js" async></script>\n<div data-kx-widget data-org="${slug}"${doctor} data-locale="${input.locale}"></div>`,
    iframe: `<iframe src="${base}/v1/embed/${slug}?locale=${input.locale}${input.doctorSlug ? `&doctor=${encodeURIComponent(input.doctorSlug)}` : ""}" title="Book online" width="100%" height="640" style="border:0" loading="lazy" allow="payment"></iframe>`,
  };
}
