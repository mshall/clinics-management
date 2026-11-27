import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kiorexOidcProblems, passportClientOverride, readKiorexOidcConfig } from "./kiorex-oidc.port";
import { clinicDeploymentDefault, effectiveOrgDefault, resolvePublicSignInConfig } from "./sign-in-config";
import { nurseWebHost } from "../config/host-config";

// Fixture hosts use a reserved example domain.
const ISSUER = "https://passport.example.test";
const WEB = "https://clinic.example.test";
const prod = (o: Record<string, string> = {}) => ({ NODE_ENV: "production", KIOREX_OIDC_ISSUER: ISSUER, KIOREX_OIDC_CLIENT_SECRET: "x".repeat(32), ...o }) as NodeJS.ProcessEnv;

describe("Passport (OIDC) configuration is environment-driven", () => {
  it("issuer unset: Passport is off (the state of an existing deployment that never configured it)", () => {
    assert.equal(readKiorexOidcConfig({ NODE_ENV: "production", APP_WEB_URL: WEB } as never), null);
    assert.deepEqual(kiorexOidcProblems({ NODE_ENV: "production" } as never), [], "deliberately unset is not a problem");
  });

  it("production has NO localhost default: a missing web origin or secret turns Passport off and names the variable", () => {
    assert.equal(readKiorexOidcConfig(prod()), null);
    assert.deepEqual(kiorexOidcProblems(prod()), ["APP_WEB_URL (or WEB_PUBLIC_ORIGIN / KIOREX_OIDC_REDIRECT_URI)"]);
    const noSecret = { NODE_ENV: "production", KIOREX_OIDC_ISSUER: ISSUER, APP_WEB_URL: WEB } as never;
    assert.equal(readKiorexOidcConfig(noSecret), null);
    assert.deepEqual(kiorexOidcProblems(noSecret), ["KIOREX_OIDC_CLIENT_SECRET"]);
  });

  it("production derives every URI from configuration, nothing local", () => {
    const c = readKiorexOidcConfig(prod({ APP_WEB_URL: `${WEB}/`, NURSE_WEB_URL: "https://nurse.example.test" }))!;
    assert.equal(c.issuer, ISSUER);
    assert.equal(c.clientId, "kiorly-clinic");
    assert.equal(c.redirectUri, `${WEB}/auth/kiorex/callback`);
    assert.equal(c.nurseRedirectUri, "https://nurse.example.test/auth/kiorex/callback");
    assert.equal(c.postLogoutRedirectUri, `${WEB}/`);
    assert.equal(c.backchannelLogoutUri, `${WEB}/api/v1/auth/kiorex/backchannel-logout`);
    for (const v of Object.values(c)) assert.doesNotMatch(String(v), /localhost/);
  });

  it("WEB_PUBLIC_ORIGIN works as the web origin; explicit variables win over derivation", () => {
    assert.equal(readKiorexOidcConfig(prod({ WEB_PUBLIC_ORIGIN: WEB }))!.redirectUri, `${WEB}/auth/kiorex/callback`);
    const c = readKiorexOidcConfig(prod({
      KIOREX_OIDC_REDIRECT_URI: "https://a.example.test/cb",
      KIOREX_OIDC_POST_LOGOUT_REDIRECT_URI: "https://a.example.test/bye",
      KIOREX_OIDC_BACKCHANNEL_LOGOUT_URI: "https://api.example.test/bcl",
      KIOREX_OIDC_CLIENT_ID: "other",
    }))!;
    assert.deepEqual([c.redirectUri, c.postLogoutRedirectUri, c.backchannelLogoutUri, c.clientId], ["https://a.example.test/cb", "https://a.example.test/bye", "https://api.example.test/bcl", "other"]);
  });

  it("local development keeps its historic localhost defaults", () => {
    const c = readKiorexOidcConfig({ NODE_ENV: "development", KIOREX_OIDC_ISSUER: "http://localhost:4400" } as never)!;
    assert.equal(c.redirectUri, "http://localhost:5174/auth/kiorex/callback");
    assert.equal(c.clientSecret, "dev-kiorly-clinic-secret");
    assert.equal(c.postLogoutRedirectUri, "http://localhost:5174/");
  });

  it("the Passport client override JSON is derived from the same env and is valid for kiorex-account (https, no wildcard, no fragment)", () => {
    const o = passportClientOverride(prod({ APP_WEB_URL: WEB, NURSE_WEB_URL: "https://nurse.example.test" }))!["kiorly-clinic"];
    assert.deepEqual(o.redirectUris, [`${WEB}/auth/kiorex/callback`, "https://nurse.example.test/auth/kiorex/callback"]);
    assert.deepEqual(o.postLogoutRedirectUris, [`${WEB}/`]);
    assert.equal(o.backchannelLogoutUri, `${WEB}/api/v1/auth/kiorex/backchannel-logout`);
    assert.doesNotMatch(JSON.stringify(o), /x{8}/, "the real secret is never emitted");
    for (const u of [...o.redirectUris, ...o.postLogoutRedirectUris, o.backchannelLogoutUri]) assert.match(u, /^https:\/\/[a-z0-9.-]+\/[^#*\s]*$/);
    assert.equal(passportClientOverride({ NODE_ENV: "production" } as never), null);
  });

  it("nurse host comes from NURSE_WEB_URL, else the legacy default", () => {
    assert.equal(nurseWebHost({ NURSE_WEB_URL: "https://nurse.example.test:8443/x" }), "nurse.example.test");
    assert.equal(nurseWebHost({}), "nurse.kiorly.com");
  });
});

describe("existing sign-in method stays the default (nothing changes until an admin switches it)", () => {
  const standalone = { stored: null, linkedToKiorex: false };
  it("Passport not configured: always PASSWORD, for every organisation", () => {
    for (const org of [standalone, { stored: "PASSPORT" as const, linkedToKiorex: true }, null])
      assert.deepEqual(resolvePublicSignInConfig({ passportAvailable: false, org, deployment: "PASSWORD" }), { passportAvailable: false, defaultMethod: "PASSWORD" });
  });
  it("Passport configured: an organisation without an explicit choice that is not linked still defaults to PASSWORD; an explicit choice wins", () => {
    assert.equal(effectiveOrgDefault(standalone), "PASSWORD");
    assert.equal(effectiveOrgDefault({ stored: "PASSWORD", linkedToKiorex: true }), "PASSWORD");
    assert.equal(resolvePublicSignInConfig({ passportAvailable: true, org: standalone, deployment: "PASSPORT" }).defaultMethod, "PASSWORD", "an org's own automatic value beats the deployment default");
    assert.equal(clinicDeploymentDefault("CLINIC", {}), "PASSWORD");
    assert.equal(clinicDeploymentDefault("NURSE", {}), "PASSPORT", "unchanged Nurse-edition behaviour");
  });
});
