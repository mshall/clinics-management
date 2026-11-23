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
