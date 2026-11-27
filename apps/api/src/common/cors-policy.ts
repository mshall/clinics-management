/**
 * CORS policy (ADR-059, ENVIRONMENT_CONFIGURATION_STANDARD section 5). Pure functions of an env object; no host literal.
 *
 * `CORS_ALLOWED_ORIGINS` = comma separated origins (scheme + host [+ port], no path), generated from the registry
 * (`validate-registry.mjs --emit cors --env <id>` / the `{cors}` placeholder of the Clinic service block). Rules:
 *
 *  - A request whose Origin equals the origin it was addressed to (same-origin) is ALWAYS allowed. Browsers do not need CORS headers for
 *    same-origin calls, so this never depends on the list.
 *  - The Clinic web origin(s) given by existing configuration (`APP_WEB_URL`, `WEB_PUBLIC_ORIGIN`, `NURSE_WEB_URL`) are ALWAYS added to a
 *    configured list. That is how the deployed CloudFront origin stays reachable without a host being written in code.
 *  - `*` means "reflect any origin" and is accepted ONLY outside production (local development). In production it is ignored (and reported).
 *  - Outside production, `https` and `http` entries are accepted; in production only `https` and only bare origins (anything else is dropped and reported).
 *  - FAIL CLOSED in production: when the variable is present but yields no valid origin, no cross-origin request is allowed (same-origin only).
 *  - VARIABLE UNSET:
 *      non-production -> reflect any origin (today's behaviour, local development);
 *      production     -> LEGACY MODE: reflect any origin, exactly as before this change, with one startup warning. This is the compatibility
 *                       default so the already-deployed site (CloudFront web origin, same-origin /api/*, native apps, the booking widget on
 *                       third-party sites) keeps working untouched. FOLLOW-UP: set CORS_ALLOWED_ORIGINS at deploy time (value in
 *                       Docs/ENVIRONMENT_CONFIG.md) to leave legacy mode; nothing else changes then for the same-origin web.
 *
 * The API is bearer-token only (no cookies, `credentials: false`), which is why legacy reflection was never a session-riding risk.
 */
type Env = Record<string, string | undefined>;

export type CorsMode = "allow-list" | "wildcard-dev" | "legacy-reflect" | "closed";

export interface CorsPolicy {
  mode: CorsMode;
  /** Normalised allowed origins (allow-list mode, also the base of `closed`). */
  origins: ReadonlySet<string>;
  /** Human-readable notes for the startup log (variable NAMES and counts only). */
  notices: string[];
}

/** `https://Host:443/` -> `https://host`; null when it is not a bare http(s) origin. */
export function normaliseOrigin(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.search || u.hash) return null;
    if (u.pathname !== "/" && u.pathname !== "") return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

const WEB_ORIGIN_VARS = ["APP_WEB_URL", "WEB_PUBLIC_ORIGIN", "NURSE_WEB_URL"] as const;

export function resolveCorsPolicy(env: Env = process.env): CorsPolicy {
  const prod = env.NODE_ENV === "production";
  const raw = env.CORS_ALLOWED_ORIGINS;
  const notices: string[] = [];
  if (raw === undefined) {
    if (prod) notices.push("CORS_ALLOWED_ORIGINS is not set: LEGACY MODE, any Origin is reflected (set the variable at deploy time to restrict it)");
    return { mode: "legacy-reflect", origins: new Set(), notices };
  }
  const origins = new Set<string>();
  let wildcard = false;
  let dropped = 0;
  for (const part of raw.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (p === "*") { if (prod) dropped++; else wildcard = true; continue; }
    const o = normaliseOrigin(p);
    if (!o || (prod && !o.startsWith("https://"))) { dropped++; continue; }
    origins.add(o);
  }
  if (dropped) notices.push(`CORS_ALLOWED_ORIGINS: ${dropped} entr${dropped === 1 ? "y" : "ies"} ignored (production accepts only bare https origins; "*" is for local development only)`);
  if (wildcard) return { mode: "wildcard-dev", origins, notices };
  if (!origins.size) {
    notices.push("CORS_ALLOWED_ORIGINS has no valid origin: cross-origin requests are refused (same-origin only)");
    // the configured web origins stay reachable even then (same configuration the app already needs)
  }
  for (const v of WEB_ORIGIN_VARS) {
    const o = env[v] ? normaliseOrigin(env[v]!) : null;
    if (o && (!prod || o.startsWith("https://"))) origins.add(o);
  }
  return { mode: origins.size ? "allow-list" : "closed", origins, notices };
}

/** The origin a request was addressed to, honouring the proxy headers CloudFront / App Runner set. */
export function requestOrigin(req: { headers: Record<string, string | string[] | undefined>; protocol?: string; secure?: boolean }): string | null {
  const h = (n: string): string => { const v = req.headers[n]; return (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim() ?? ""; };
  const host = h("x-forwarded-host") || h("host");
  if (!host) return null;
  const proto = h("x-forwarded-proto") || (req.secure ? "https" : req.protocol) || "http";
  return normaliseOrigin(`${proto}://${host}`);
}

export function isOriginAllowed(policy: CorsPolicy, origin: string | undefined, sameOrigin: string | null): boolean {
  if (!origin) return true; // not a browser cross-origin call: nothing to decide
  const o = normaliseOrigin(origin);
  if (policy.mode === "legacy-reflect" || policy.mode === "wildcard-dev") return true;
  if (!o) return false;
  if (sameOrigin && o === sameOrigin) return true;
  return policy.origins.has(o);
}

export const CORS_EXPOSED_HEADERS = [
  "X-Kiorly-Web-Build-Id",
  "X-Kiorly-Web-Build-Built-At",
  "X-Kiorly-Web-Min-Built-At",
  // Org-backup fetch downloads (cross-origin from Vite -> API) need these for progress / filename.
  "Content-Length",
  "Content-Disposition",
];

type DelegateReq = { headers: Record<string, string | string[] | undefined>; protocol?: string; secure?: boolean };

/** `app.enableCors(...)` options: a per-request delegate so the same-origin check can see the Host header. */
export function corsOptionsDelegate(policy: CorsPolicy) {
  return (req: DelegateReq, cb: (err: Error | null, options?: { origin: boolean; credentials: boolean; exposedHeaders: string[] }) => void): void => {
    const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) as string | undefined;
    const allowed = isOriginAllowed(policy, origin, requestOrigin(req));
    cb(null, { origin: allowed, credentials: false, exposedHeaders: CORS_EXPOSED_HEADERS });
  };
}
