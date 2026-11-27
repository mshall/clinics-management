/**
 * KCV-201 — thin port over `openid-client` (auth code + PKCE, confidential client `kiorly-clinic`) and `jose`
 * (back-channel logout token verification). No custom crypto: both libraries do all signing/verification.
 */
import type { JWTVerifyGetKey } from "jose";
import { HOST_DEFAULTS } from "../config/host-config";

export type KiorexOidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** nurse.kiorly.com callback (Kiorly Nurse edition, ADR-031). Same client and audience; only the redirect URI differs. */
  nurseRedirectUri: string;
  /** Registered post-logout URI (the Clinic web root by default). */
  postLogoutRedirectUri: string;
  /** Back-channel logout endpoint Passport calls (registered on the Passport side; informational here). */
  backchannelLogoutUri: string;
};

export type KiorexIdentityClaims = {
  sub: string;
  sid?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
  name?: string;
  /** Raw ID token: kept only to build the RP-initiated logout `id_token_hint` (never stored server-side, never logged). */
  idToken?: string;
};

export interface KiorexOidcPort {
  authorizationUrl(p: { state: string; nonce: string; codeChallenge: string; redirectUri?: string }): string;
  /** Exchanges the code (PKCE), validating state, nonce and the ID token signature. */
  exchange(
    params: { code: string; state: string; iss?: string },
    checks: { state: string; nonce: string; codeVerifier: string },
    opts?: { redirectUri?: string },
  ): Promise<KiorexIdentityClaims>;
  /** RP-initiated logout URL. With a verified `id_token_hint` Passport ends its session without a confirmation page. */
  endSessionUrl?(p: { idTokenHint: string; postLogoutRedirectUri?: string }): string;
  logoutKeys(): JWTVerifyGetKey;
  readonly issuer: string;
  readonly clientId: string;
}

const stripSlash = (v: string): string => v.replace(/\/+$/, "");

/**
 * Passport (OIDC) client configuration, fully environment-driven (ADR-059, ENVIRONMENT_CONFIGURATION_STANDARD).
 *
 *   KIOREX_OIDC_ISSUER                   Passport issuer; unset = Passport sign-in off (button hidden, nothing changes)
 *   KIOREX_OIDC_CLIENT_ID                default `kiorly-clinic`
 *   KIOREX_OIDC_CLIENT_SECRET            injected from the secret store by reference (App Runner runtimeEnvironmentSecrets); never in git
 *   KIOREX_OIDC_REDIRECT_URI             default `<APP_WEB_URL or WEB_PUBLIC_ORIGIN>/auth/kiorex/callback`
 *   KIOREX_OIDC_REDIRECT_URI_NURSE       default `<NURSE_WEB_URL>/auth/kiorex/callback`
 *   KIOREX_OIDC_POST_LOGOUT_REDIRECT_URI default the origin of the redirect URI + `/`
 *   KIOREX_OIDC_BACKCHANNEL_LOGOUT_URI   the URL Passport calls (registered in Passport, informational here); default `<web origin>/api/v1/auth/kiorex/backchannel-logout`
 *
 * Outside production the historic localhost defaults stay (local development). In production there is NO localhost default: a missing
 * web origin or secret makes the config unusable (`null` = Passport off, never a half-configured redirect), and `kiorexOidcProblems` names why.
 */
export function readKiorexOidcConfig(env: NodeJS.ProcessEnv = process.env): KiorexOidcConfig | null {
  const issuer = env.KIOREX_OIDC_ISSUER?.trim().replace(/\/+$/, "");
  if (!issuer) return null;
  const prod = env.NODE_ENV === "production";
  const clientSecret = env.KIOREX_OIDC_CLIENT_SECRET?.trim() || (prod ? "" : "dev-kiorly-clinic-secret");
  if (!clientSecret) return null;
  const explicitWeb = env.APP_WEB_URL?.trim() || env.WEB_PUBLIC_ORIGIN?.trim() || "";
  const explicitRedirect = env.KIOREX_OIDC_REDIRECT_URI?.trim() || "";
  if (prod && !explicitWeb && !explicitRedirect) return null; // no localhost default in production
  const web = stripSlash(explicitWeb || "http://localhost:5174");
  const redirectUri = explicitRedirect || `${web}/auth/kiorex/callback`;
  const webOrigin = (() => { try { return new URL(redirectUri).origin; } catch { return web; } })();
  return {
    issuer,
    clientId: env.KIOREX_OIDC_CLIENT_ID?.trim() || "kiorly-clinic",
    clientSecret,
    redirectUri,
    nurseRedirectUri:
      env.KIOREX_OIDC_REDIRECT_URI_NURSE?.trim() ||
      `${stripSlash(env.NURSE_WEB_URL?.trim() || (prod ? `https://${HOST_DEFAULTS.nurseWebHost}` : "http://nurse.localhost:5174"))}/auth/kiorex/callback`,
    postLogoutRedirectUri: env.KIOREX_OIDC_POST_LOGOUT_REDIRECT_URI?.trim() || `${webOrigin}/`,
    backchannelLogoutUri: env.KIOREX_OIDC_BACKCHANNEL_LOGOUT_URI?.trim() || `${webOrigin}/api/v1/auth/kiorex/backchannel-logout`,
  };
}

/** Why Passport is off although `KIOREX_OIDC_ISSUER` is set (variable NAMES only, never values). Empty when usable or deliberately unset. */
export function kiorexOidcProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!env.KIOREX_OIDC_ISSUER?.trim() || readKiorexOidcConfig(env)) return [];
  const out: string[] = [];
  if (!env.KIOREX_OIDC_CLIENT_SECRET?.trim() && env.NODE_ENV === "production") out.push("KIOREX_OIDC_CLIENT_SECRET");
  if (!env.APP_WEB_URL?.trim() && !env.WEB_PUBLIC_ORIGIN?.trim() && !env.KIOREX_OIDC_REDIRECT_URI?.trim() && env.NODE_ENV === "production") out.push("APP_WEB_URL (or WEB_PUBLIC_ORIGIN / KIOREX_OIDC_REDIRECT_URI)");
  return out;
}

/**
 * The `KX_CLIENT_OVERRIDES_JSON` entry Passport needs for this Clinic (kiorex-account Docs/DEPLOY_DEV.md): derived from the SAME env the
 * Clinic reads, so the two cannot drift. The secret is a placeholder: the real value is generated once and injected on both sides by reference.
 */
export function passportClientOverride(env: NodeJS.ProcessEnv = process.env): { "kiorly-clinic": { redirectUris: string[]; postLogoutRedirectUris: string[]; backchannelLogoutUri: string; clientSecret: string } } | null {
  const c = readKiorexOidcConfig(env);
  if (!c) return null;
  return {
    "kiorly-clinic": {
      redirectUris: [...new Set([c.redirectUri, c.nurseRedirectUri])],
      postLogoutRedirectUris: [c.postLogoutRedirectUri],
      backchannelLogoutUri: c.backchannelLogoutUri,
      clientSecret: "<same value as KIOREX_OIDC_CLIENT_SECRET (32+ random characters, from the secret store)>",
    },
  };
}

/** Real implementation (lazy discovery so a down IdP never blocks API boot). openid-client v6 (functional API). */
export async function createOpenIdClientPort(cfg: KiorexOidcConfig): Promise<KiorexOidcPort> {
  const oidc = await import("openid-client");
  const { createRemoteJWKSet } = await import("jose");
  // Dev IdP (kiorex-account) is plain http on localhost; openid-client v6 refuses http unless explicitly allowed.
  const allowHttp = cfg.issuer.startsWith("http://") && process.env.NODE_ENV !== "production";
  const config = await oidc.discovery(
    new URL(cfg.issuer),
    cfg.clientId,
    { redirect_uris: [cfg.redirectUri, cfg.nurseRedirectUri], response_types: ["code"] },
    oidc.ClientSecretBasic(cfg.clientSecret),
    allowHttp ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
  const jwksUri = config.serverMetadata().jwks_uri;
  if (!jwksUri) throw new Error("Kiorex issuer metadata has no jwks_uri");
  const keys = createRemoteJWKSet(new URL(jwksUri));
  return {
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    authorizationUrl: ({ state, nonce, codeChallenge, redirectUri }) =>
      oidc
        .buildAuthorizationUrl(config, {
          redirect_uri: redirectUri ?? cfg.redirectUri,
          scope: "openid profile phone",
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        })
        .href,
    exchange: async (params, checks, opts) => {
      // v6 derives the token-request redirect_uri from the callback URL (minus its query), so rebuild it.
      const callbackUrl = new URL(opts?.redirectUri ?? cfg.redirectUri);
      callbackUrl.searchParams.set("code", params.code);
      callbackUrl.searchParams.set("state", params.state);
      if (params.iss) callbackUrl.searchParams.set("iss", params.iss);
      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        pkceCodeVerifier: checks.codeVerifier,
      });
      const c = tokens.claims();
      if (!c) throw new Error("Kiorex token response carried no ID token");
      return {
        sub: c.sub,
        sid: typeof c.sid === "string" ? c.sid : undefined,
        phone_number: c.phone_number as string | undefined,
        phone_number_verified: c.phone_number_verified as boolean | undefined,
        name: c.name as string | undefined,
        idToken: tokens.id_token,
      };
    },
    endSessionUrl: ({ idTokenHint, postLogoutRedirectUri }) =>
      oidc.buildEndSessionUrl(config, { id_token_hint: idTokenHint, client_id: cfg.clientId, ...(postLogoutRedirectUri ? { post_logout_redirect_uri: postLogoutRedirectUri } : {}) }).href,
    logoutKeys: () => keys,
  };
}
