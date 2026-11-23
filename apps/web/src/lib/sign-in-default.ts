/**
 * Which sign-in method the login page PRESELECTS (ADR-038 amendment, founder decision 24 Nov 2026). Both methods stay available whenever
 * Passport is offered; this only picks the starting tab. Order (first match wins):
 *   1. Passport is not offered by the API -> password (the only option)
 *   2. the method last used on this browser (`kiorly.signin.method`)
 *   3. the API's default for the organisation identified before login (`?org=`, subdomain, last-used org) or, with no org, the deployment default
 *   4. password
 * Kept free of React and of globals so it is unit-testable with `node --test`.
 */
import type { SignInMethod } from "./sign-in-method";

export type ApiDefaultMethod = "PASSWORD" | "PASSPORT";
export const SIGN_IN_ORG_KEY = "kiorly.signin.org";

/** The API answers `defaultMethod` in upper case; anything else (older API) is "no opinion". */
export function parseApiDefault(v: unknown): SignInMethod | null {
  return v === "PASSPORT" ? "passport" : v === "PASSWORD" ? "password" : null;
}

export function resolveInitialMethod(i: { passportOffered: boolean; remembered: SignInMethod | null; apiDefault: unknown }): SignInMethod {
  if (!i.passportOffered) return "password";
  return i.remembered ?? parseApiDefault(i.apiDefault) ?? "password";
}

/** Hostname labels that name a product or environment, never an organisation. */
const RESERVED = new Set(["www", "app", "api", "nurse", "lab", "pharmacy", "clinic", "kiorly", "kiorex", "home", "account", "staging", "dev", "test", "localhost"]);

/** Organisation hint before login: `?org=` wins, then the first label of a tenant subdomain (`nile.lab.kiorly.link`), then the org remembered on this browser. */
export function orgHintFrom(i: { search: string; hostname: string; remembered: string | null }): string | null {
  const ok = (v: string | null | undefined) => (v && /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(v.trim()) ? v.trim() : null);
  const q = ok(new URLSearchParams(i.search).get("org"));
  if (q) return q;
  const labels = i.hostname.toLowerCase().split(".");
  const isIp = /^\d+(\.\d+){3}$/.test(i.hostname) || i.hostname.includes(":");
  if (!isIp && labels.length >= 4 && !RESERVED.has(labels[0]!)) { const s = ok(labels[0]); if (s) return s; }
  return ok(i.remembered);
}

type Store = Pick<Storage, "getItem" | "setItem">;
const defaultStore = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
export function readSignInOrg(store: Store | null = defaultStore()): string | null { try { return store?.getItem(SIGN_IN_ORG_KEY) ?? null; } catch { return null; } }
/** Call after a sign-in succeeded: the next visit asks the API for this organisation's default. Storage may be blocked: then it is simply not kept. */
export function rememberSignInOrg(org: string | null | undefined, store: Store | null = defaultStore()): void {
  if (!org || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(org)) return;
  try { store?.setItem(SIGN_IN_ORG_KEY, org); } catch { /* ignore */ }
}

/** The organisation hint for this page load (`?org=`, tenant subdomain, org remembered on this browser). */
export function currentOrgHint(): string | null {
  if (typeof window === "undefined") return null;
  return orgHintFrom({ search: window.location.search, hostname: window.location.hostname, remembered: readSignInOrg() });
}
