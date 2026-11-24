import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homeUrlFromEnv, LOCAL_HOME_URL, switchWorkspaceHref, wantsPassportAutostart, readHandoff, withoutHandoff } from "./kiorly-home";

describe("Switch workspace link (Kiorly Home)", () => {
  it("points at <home>/signin?switch=1, whatever path the configured URL carries", () => {
    assert.equal(switchWorkspaceHref("http://localhost:5194"), "http://localhost:5194/signin?switch=1");
    assert.equal(switchWorkspaceHref("https://www.kiorly.com/signin"), "https://www.kiorly.com/signin?switch=1");
    assert.equal(switchWorkspaceHref(" https://www.staging.kiorly.com/ "), "https://www.staging.kiorly.com/signin?switch=1");
  });
  it("is hidden when nothing safe is configured (no link beats a wrong link)", () => {
    for (const v of [undefined, null, "", "  ", "not a url", "javascript:alert(1)", "http://www.kiorly.com", "ftp://x"]) assert.equal(switchWorkspaceHref(v), null, String(v));
  });
  it("dev falls back to the local Home port, a production build has no default", () => {
    assert.equal(homeUrlFromEnv({ DEV: true, localDefault: LOCAL_HOME_URL }), LOCAL_HOME_URL);
    assert.equal(homeUrlFromEnv({ DEV: false }), undefined);
    assert.equal(homeUrlFromEnv({ DEV: false, VITE_KIORLY_HOME_URL: "https://www.kiorly.com" }), "https://www.kiorly.com");
    assert.equal(homeUrlFromEnv({ DEV: true, VITE_KIORLY_HOME_URL: "https://www.staging.kiorly.com" }), "https://www.staging.kiorly.com");
    assert.equal(homeUrlFromEnv({ DEV: true, VITE_KIORLY_HOME_URL: "  ", localDefault: LOCAL_HOME_URL }), LOCAL_HOME_URL);
  });
});

describe("?sso=passport auto-start", () => {
  it("starts for what Kiorly Home sends, with or without the edition hint", () => {
    assert.equal(wantsPassportAutostart("?sso=passport&from=kiorly-home"), true);
    assert.equal(wantsPassportAutostart("?sso=passport&from=kiorly-home&edition=NURSE"), true);
    assert.equal(wantsPassportAutostart("?sso=passport", "navigate"), true);
    assert.equal(wantsPassportAutostart("?sso=passport", "reload"), true);
  });
  it("does not start for anything else, nor when the person came back with the Back button (no loop)", () => {
    for (const s of ["", "?", "?sso=other", "?sso=", "?from=kiorly-home", "?SSO=passport"]) assert.equal(wantsPassportAutostart(s), false, s);
    assert.equal(wantsPassportAutostart("?sso=passport", "back_forward"), false);
  });
});

describe("Kiorly Home password handoff (URL handling)", () => {
  it("reads a well-formed code and a known-shape reason, nothing else", () => {
    const code = "A".repeat(43);
    assert.deepEqual(readHandoff(`?handoff=${code}&from=kiorly-home`), { code, reason: null });
    assert.deepEqual(readHandoff("?reason=mfa&from=kiorly-home"), { code: null, reason: "mfa" });
    assert.deepEqual(readHandoff("?handoff=<script>&reason=Bad Reason"), { code: null, reason: null });
    assert.deepEqual(readHandoff(""), { code: null, reason: null });
  });
  it("strips the code (and reason) from the URL but keeps other parameters", () => {
    assert.equal(withoutHandoff("/login", `?handoff=${"B".repeat(43)}&from=kiorly-home&edition=NURSE`), "/login?from=kiorly-home&edition=NURSE");
    assert.equal(withoutHandoff("/login", `?handoff=${"B".repeat(43)}`), "/login");
    assert.equal(withoutHandoff("/login", "?reason=mfa&x=1", "#a"), "/login?x=1#a");
  });
});
