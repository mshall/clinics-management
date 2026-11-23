/**
 * Per-organisation DEFAULT SIGN-IN METHOD (ADR-038 amendment, founder decision 24 Nov 2026).
 *
 * Both methods (Kiorex Passport and Password) are ALWAYS offered when Passport is available; this setting only chooses which one is
 * PRESELECTED on the login page. Stored per organisation (`defaultSignInMethod`, nullable): null means "automatic" = PASSPORT for an
 * organisation that is linked to Kiorex (marketplace link or Passport-linked staff), PASSWORD for a standalone one. An owner/admin may
 * override it explicitly. The login page is pre-auth, so the public config endpoint answers per `?org=` and falls back to the deployment
 * default (`SIGNIN_DEFAULT_METHOD`) for a missing or unknown org, with the SAME shape (non-enumerating).
 * Pure module (no Nest, no Prisma): unit-tested with `node --test`. Vendored copy: the products never import each other.
 */
export const SIGN_IN_METHODS = ["PASSWORD", "PASSPORT"] as const;
export type SignInDefaultMethod = (typeof SIGN_IN_METHODS)[number];

export function parseSignInMethod(v: unknown): SignInDefaultMethod | null {
  if (typeof v !== "string") return null;
  const u = v.trim().toUpperCase();
  return u === "PASSWORD" || u === "PASSPORT" ? u : null;
}

/** Deployment default: `SIGNIN_DEFAULT_METHOD` (PASSWORD for standalone deployments, PASSPORT for Kiorex-hosted ones), PASSWORD when unset or invalid. */
export function deploymentDefaultMethod(env: Record<string, string | undefined> = process.env): SignInDefaultMethod {
  return parseSignInMethod(env.SIGNIN_DEFAULT_METHOD) ?? "PASSWORD";
}

export interface OrgSignInFacts {
  /** The owner's explicit choice, or null = automatic. */
  stored: SignInDefaultMethod | null;
  /** Linked to Kiorex: marketplace link or at least one Passport-linked staff member. */
  linkedToKiorex: boolean;
}

/** The default an organisation effectively has: explicit choice, else PASSPORT when linked to Kiorex, else PASSWORD. */
export function effectiveOrgDefault(o: OrgSignInFacts): SignInDefaultMethod {
  return o.stored ?? (o.linkedToKiorex ? "PASSPORT" : "PASSWORD");
}

/**
 * What the public config answers: `{ passportAvailable, defaultMethod }`. Passport unavailable: always PASSWORD.
 * `org` null = no org given or unknown org: the deployment default (uniform answer, never reveals whether an org exists).
 */
export function resolvePublicSignInConfig(i: { passportAvailable: boolean; org: OrgSignInFacts | null; deployment: SignInDefaultMethod }): { passportAvailable: boolean; defaultMethod: SignInDefaultMethod } {
  if (!i.passportAvailable) return { passportAvailable: false, defaultMethod: "PASSWORD" };
  return { passportAvailable: true, defaultMethod: i.org ? effectiveOrgDefault(i.org) : i.deployment };
}

/** Shape check for the `org` query value (slug or id): short, no surprises. Anything else is treated as "no org". */
export function cleanOrgHint(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(v.trim()) ? v.trim() : null;
}

/** Tiny fixed-window limiter for the public config (per key, e.g. client IP). In-memory: enough to blunt scraping; the answers are uniform anyway. */
export function makeWindowLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { n: number; t: number }>();
  return (key: string): boolean => {
    const t = now(); const h = hits.get(key);
    if (hits.size > 5000) for (const [k, v] of hits) if (t - v.t > windowMs) hits.delete(k);
    if (!h || t - h.t > windowMs) { hits.set(key, { n: 1, t }); return true; }
    return ++h.n <= max;
  };
}
