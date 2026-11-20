/**
 * KCV-201 — thin port over `openid-client` (auth code + PKCE, confidential client `kiorly-clinic`) and `jose`
 * (back-channel logout token verification). No custom crypto: both libraries do all signing/verification.
 */
import type { JWTVerifyGetKey } from "jose";

export type KiorexOidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** nurse.kiorly.com callback (Kiorly Nurse edition, ADR-031). Same client and audience; only the redirect URI differs. */
  nurseRedirectUri: string;
};

export type KiorexIdentityClaims = {
  sub: string;
  sid?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
  name?: string;
};

export interface KiorexOidcPort {
  authorizationUrl(p: { state: string; nonce: string; codeChallenge: string; redirectUri?: string }): string;
  /** Exchanges the code (PKCE), validating state, nonce and the ID token signature. */
  exchange(
    params: { code: string; state: string; iss?: string },
    checks: { state: string; nonce: string; codeVerifier: string },
    opts?: { redirectUri?: string },
  ): Promise<KiorexIdentityClaims>;
  logoutKeys(): JWTVerifyGetKey;
  readonly issuer: string;
  readonly clientId: string;
}

export function readKiorexOidcConfig(env: NodeJS.ProcessEnv = process.env): KiorexOidcConfig | null {
  const issuer = env.KIOREX_OIDC_ISSUER?.trim().replace(/\/+$/, "");
  if (!issuer) return null;
  const prod = env.NODE_ENV === "production";
  const clientSecret = env.KIOREX_OIDC_CLIENT_SECRET?.trim() || (prod ? "" : "dev-kiorly-clinic-secret");
  if (!clientSecret) return null;
  const web = (env.APP_WEB_URL?.trim() || "http://localhost:5174").replace(/\/+$/, "");
  return {
    issuer,
    clientId: env.KIOREX_OIDC_CLIENT_ID?.trim() || "kiorly-clinic",
    clientSecret,
    redirectUri: env.KIOREX_OIDC_REDIRECT_URI?.trim() || `${web}/auth/kiorex/callback`,
    nurseRedirectUri:
      env.KIOREX_OIDC_REDIRECT_URI_NURSE?.trim() ||
      `${(env.NURSE_WEB_URL?.trim() || (prod ? "https://nurse.kiorly.com" : "http://nurse.localhost:5174")).replace(/\/+$/, "")}/auth/kiorex/callback`,
  };
}

/** Real implementation (lazy discovery so a down IdP never blocks API boot). */
export async function createOpenIdClientPort(cfg: KiorexOidcConfig): Promise<KiorexOidcPort> {
  const { Issuer } = await import("openid-client");
  const { createRemoteJWKSet } = await import("jose");
  const issuer = await Issuer.discover(cfg.issuer);
  const client = new issuer.Client({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uris: [cfg.redirectUri, cfg.nurseRedirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
  });
  const jwksUri = issuer.metadata.jwks_uri;
  if (!jwksUri) throw new Error("Kiorex issuer metadata has no jwks_uri");
  const keys = createRemoteJWKSet(new URL(jwksUri));
  return {
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    authorizationUrl: ({ state, nonce, codeChallenge, redirectUri }) =>
      client.authorizationUrl({
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
        scope: "openid profile phone",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }),
    exchange: async (params, checks, opts) => {
      const set = await client.callback(
        opts?.redirectUri ?? cfg.redirectUri,
        { code: params.code, state: params.state, ...(params.iss ? { iss: params.iss } : {}) },
        { state: checks.state, nonce: checks.nonce, code_verifier: checks.codeVerifier },
      );
      const c = set.claims();
      return {
        sub: c.sub,
        sid: typeof c.sid === "string" ? c.sid : undefined,
        phone_number: c.phone_number as string | undefined,
        phone_number_verified: c.phone_number_verified as boolean | undefined,
        name: c.name as string | undefined,
      };
    },
    logoutKeys: () => keys,
  };
}
