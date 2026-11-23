import assert from "node:assert/strict";
import { test } from "node:test";
import { SIGN_IN_ORG_KEY, orgHintFrom, parseApiDefault, rememberSignInOrg, resolveInitialMethod } from "./sign-in-default";

test("Passport not offered: password, whatever else says", () => {
  assert.equal(resolveInitialMethod({ passportOffered: false, remembered: null, apiDefault: "PASSPORT" }), "password");
  assert.equal(resolveInitialMethod({ passportOffered: false, remembered: "passport", apiDefault: "PASSPORT" }), "password");
});
test("remembered method beats the org default; the org default beats nothing", () => {
  assert.equal(resolveInitialMethod({ passportOffered: true, remembered: "password", apiDefault: "PASSPORT" }), "password");
  assert.equal(resolveInitialMethod({ passportOffered: true, remembered: "passport", apiDefault: "PASSWORD" }), "passport");
  assert.equal(resolveInitialMethod({ passportOffered: true, remembered: null, apiDefault: "PASSPORT" }), "passport");
  assert.equal(resolveInitialMethod({ passportOffered: true, remembered: null, apiDefault: "PASSWORD" }), "password");
});
test("an older API with no default (or garbage) falls back to password", () => {
  assert.equal(resolveInitialMethod({ passportOffered: true, remembered: null, apiDefault: undefined }), "password");
  assert.equal(parseApiDefault("telepathy"), null);
});
test("org hint: ?org= first, then a tenant subdomain, then the remembered org; never a product host or garbage", () => {
  assert.equal(orgHintFrom({ search: "?org=nile-lab", hostname: "localhost", remembered: "old" }), "nile-lab");
  assert.equal(orgHintFrom({ search: "", hostname: "nile.lab.kiorly.link", remembered: "old" }), "nile");
  assert.equal(orgHintFrom({ search: "", hostname: "nurse.kiorly.com", remembered: "old" }), "old");
  assert.equal(orgHintFrom({ search: "", hostname: "app.kiorly.com", remembered: null }), null);
  assert.equal(orgHintFrom({ search: "?org=a b;x", hostname: "127.0.0.1", remembered: null }), null);
  assert.equal(orgHintFrom({ search: "", hostname: "app.lab.kiorly.link", remembered: null }), null);
});
test("the org is remembered only when well-formed", () => {
  const m = new Map<string, string>(); const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  rememberSignInOrg("bad value!", store); assert.equal(m.size, 0);
  rememberSignInOrg("clx123abc", store); assert.equal(m.get(SIGN_IN_ORG_KEY), "clx123abc");
});
