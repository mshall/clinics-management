/**
 * Kiorly Home hand-off (ADR-038): the web sign-in at `<home>/signin` that routes a person to one of their workspaces.
 *  - `switchWorkspaceHref`: the "Switch workspace" link in the app header -> `<home>/signin?switch=1` (always shows the picker).
 *  - `wantsPassportAutostart`: Home sends the browser to `<product>/login?sso=passport&from=kiorly-home[&edition=NURSE]`; the login page
 *    then starts "Sign in with Kiorex Passport" by itself, so the person only sees the OTP once (the Passport SSO session does the rest).
 * The Home URL is configuration (domain table `kiorex-account/config/domains.json`, delivered as `VITE_KIORLY_HOME_URL` at build time):
 * local dev falls back to http://localhost:5194, a production build with no value simply shows no link. Pure functions, no `import.meta`.
 */
export const LOCAL_HOME_URL = "http://localhost:5194";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The configured Home URL (build env), the local default in dev, nothing otherwise. */
export function homeUrlFromEnv(env: { VITE_KIORLY_HOME_URL?: string; DEV?: boolean }): string | undefined {
  const v = env.VITE_KIORLY_HOME_URL?.trim();
  return v ? v : env.DEV ? LOCAL_HOME_URL : undefined;
}

/** `<home origin>/signin?switch=1`, or null when no safe Home URL is configured (https anywhere, http only on a loopback host). */
export function switchWorkspaceHref(homeUrl: string | undefined | null): string | null {
  const raw = (homeUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(u.hostname))) return null;
    return `${u.origin}/signin?switch=1`;
  } catch { return null; }
}

/** True for `?sso=passport` (what Home sends), except when the person came back with the browser's Back button (no auto-start loop). */
export function wantsPassportAutostart(search: string, navigationType?: string): boolean {
  if (navigationType === "back_forward") return false;
  return new URLSearchParams(search).get("sso") === "passport";
}

/** Navigation type of the current page load ("navigate", "reload", "back_forward"), when the browser reports it. */
export function currentNavigationType(): string | undefined {
  try { return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type; } catch { return undefined; }
}

/**
 * Password handoff from Kiorly Home (ADR-038): Home's form posts the credentials to this product's `POST /auth/handoff/login`, gets a
 * single-use 30-second code and sends the browser to `<product>/login?handoff=<code>&from=kiorly-home`. This page redeems it once with
 * `POST /auth/handoff/exchange` and strips the code from the address bar BEFORE the request. `reason=mfa|password_expired|org` means the
 * handoff could not complete (second factor, expired password, organisation choice): the normal form is shown with a notice.
 */
export function readHandoff(search: string): { code: string | null; reason: string | null } {
  const q = new URLSearchParams(search);
  const code = q.get("handoff"); const reason = q.get("reason");
  return { code: code && /^[A-Za-z0-9_-]{20,128}$/.test(code) ? code : null, reason: reason && /^[a-z_]{2,32}$/.test(reason) ? reason : null };
}
/** Same URL without `handoff` (and `reason`): safe to put into history so the code never stays in the address bar, history or a bookmark. */
export function withoutHandoff(pathname: string, search: string, hash = ""): string {
  const q = new URLSearchParams(search); q.delete("handoff"); q.delete("reason");
  const rest = q.toString();
  return `${pathname}${rest ? `?${rest}` : ""}${hash}`;
}
