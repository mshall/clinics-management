import { effectiveTags } from "./link-tags";

/**
 * URL building for provider links (ARCH 4.2). Everything is derived from configuration and server-side entities; a caller-supplied URL is never
 * accepted anywhere (open-redirect protection by construction), and `assertAllowedRedirect` re-checks the host against the configured set.
 *
 *   BOOKING_LINK_BASE_URL   public clinic page base, today `${APP_WEB_URL}/b`, later `https://kiorly.link` (NH-008, config only)
 *   KIOREX_PATIENT_WEB_URL  Kiorex patient site that serves the canonical provider URL (default http://localhost:5180 in dev)
 *   KIOREX_BOOKING_WIDGET_URL  optional dedicated widget origin (ADR-044); when set it wins over the canonical URL for the Book button
 */
type Env = NodeJS.ProcessEnv;

const trim = (s: string) => s.replace(/\/+$/, "");

export function pageBaseUrl(env: Env = process.env): string {
  const explicit = env.BOOKING_LINK_BASE_URL?.trim();
  if (explicit) return trim(explicit);
  const web = env.APP_WEB_URL?.trim() || "http://localhost:5173";
  return `${trim(web)}/b`;
}

/** Origin that serves `/q/<code>`: the page base without a trailing `/b` path segment. */
export function shortLinkOrigin(env: Env = process.env): string {
  return pageBaseUrl(env).replace(/\/b$/, "");
}

export function pageUrl(slug: string, env: Env = process.env): string {
  return `${pageBaseUrl(env)}/${encodeURIComponent(slug)}`;
}

/** `kiorly.link/<slug>?s=<code>` */
export function trackedPageUrl(slug: string, code: string, env: Env = process.env): string {
  return `${pageUrl(slug, env)}?s=${encodeURIComponent(code)}`;
}

/** `kiorly.link/q/<code>`: the short form printed in QR codes (less dense). */
export function shortUrl(code: string, env: Env = process.env): string {
  return `${shortLinkOrigin(env)}/q/${encodeURIComponent(code)}`;
}

export function kiorexWebBase(env: Env = process.env): string {
  return trim(env.KIOREX_PATIENT_WEB_URL?.trim() || "http://localhost:5180");
}

export interface CanonicalTarget {
  kind: "clinic" | "doctor";
  slug: string;
  locale?: "ar" | "en";
  country?: string | null;
  /** Signed touch token, when the link is ACTIVE. */
  lt?: string | null;
  channelKind?: string;
  tags?: unknown;
}

/** Kiorex canonical URL (ARCH 4.1): `/{locale}/{cc}/{doctor|clinic}/{slug}` plus the signed touch and UTM tags (consumed by the Kiorex touch endpoint, stripped from its canonical). */
export function kiorexCanonicalUrl(t: CanonicalTarget, env: Env = process.env): string {
  const cc = (t.country ?? "EG").toLowerCase().replace(/[^a-z]/g, "").slice(0, 2) || "eg";
  const url = new URL(`${kiorexWebBase(env)}/${t.locale ?? "ar"}/${cc}/${t.kind}/${encodeURIComponent(t.slug)}`);
  if (t.lt) url.searchParams.set("lt", t.lt);
  if (t.channelKind) {
    for (const [k, v] of Object.entries(effectiveTags(t.channelKind, t.tags))) if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

/** The destination of the Book button on the public page: the dedicated widget origin when configured, else the Kiorex canonical URL. Never null. */
export function widgetEmbedUrl(
  t: CanonicalTarget & { clinicId: string; clinicianId?: string; pageSlug: string },
  env: Env = process.env,
): string {
  const widget = env.KIOREX_BOOKING_WIDGET_URL?.trim();
  if (widget) {
    const url = new URL(widget);
    url.searchParams.set("clinicId", t.clinicId);
    if (t.clinicianId) url.searchParams.set("clinicianId", t.clinicianId);
    url.searchParams.set("channel", "CLINIC_LINK");
    url.searchParams.set("slug", t.pageSlug);
    if (t.lt) url.searchParams.set("lt", t.lt);
    return url.toString();
  }
  return kiorexCanonicalUrl(t, env);
}

export function allowedRedirectHosts(env: Env = process.env): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [pageBaseUrl(env), kiorexWebBase(env), env.KIOREX_BOOKING_WIDGET_URL, env.APP_WEB_URL, env.KIOREX_ALLOWED_REDIRECT_HOSTS]) {
    for (const part of String(raw ?? "").split(",")) {
      const v = part.trim();
      if (!v) continue;
      try {
        hosts.add(new URL(v.includes("://") ? v : `https://${v}`).host.toLowerCase());
      } catch {
        /* ignore malformed config entry */
      }
    }
  }
  return hosts;
}

/** Throws when `url` is not https (or http on localhost) on a configured host. */
export function assertAllowedRedirect(url: string, env: Env = process.env): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("REDIRECT_NOT_ALLOWED");
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new Error("REDIRECT_NOT_ALLOWED");
  if (u.username || u.password) throw new Error("REDIRECT_NOT_ALLOWED");
  if (!allowedRedirectHosts(env).has(u.host.toLowerCase())) throw new Error("REDIRECT_NOT_ALLOWED");
  return u.toString();
}
