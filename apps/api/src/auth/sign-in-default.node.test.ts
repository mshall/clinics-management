import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanOrgHint, deploymentDefaultMethod, effectiveOrgDefault, makeWindowLimiter, parseSignInMethod, resolvePublicSignInConfig } from "./sign-in-default";

test("deployment default: PASSWORD unless SIGNIN_DEFAULT_METHOD says PASSPORT", () => {
  assert.equal(deploymentDefaultMethod({}), "PASSWORD");
  assert.equal(deploymentDefaultMethod({ SIGNIN_DEFAULT_METHOD: "passport" }), "PASSPORT");
  assert.equal(deploymentDefaultMethod({ SIGNIN_DEFAULT_METHOD: "carrier-pigeon" }), "PASSWORD");
});
test("org default: explicit choice wins; automatic follows the Kiorex link", () => {
  assert.equal(effectiveOrgDefault({ stored: null, linkedToKiorex: false }), "PASSWORD");
  assert.equal(effectiveOrgDefault({ stored: null, linkedToKiorex: true }), "PASSPORT");
  assert.equal(effectiveOrgDefault({ stored: "PASSWORD", linkedToKiorex: true }), "PASSWORD");
  assert.equal(effectiveOrgDefault({ stored: "PASSPORT", linkedToKiorex: false }), "PASSPORT");
});
test("public config: no Passport means PASSWORD only; unknown org gets the deployment default", () => {
  const org = { stored: "PASSPORT" as const, linkedToKiorex: false };
  assert.deepEqual(resolvePublicSignInConfig({ passportAvailable: false, org, deployment: "PASSPORT" }), { passportAvailable: false, defaultMethod: "PASSWORD" });
  assert.deepEqual(resolvePublicSignInConfig({ passportAvailable: true, org, deployment: "PASSWORD" }), { passportAvailable: true, defaultMethod: "PASSPORT" });
  assert.deepEqual(resolvePublicSignInConfig({ passportAvailable: true, org: null, deployment: "PASSPORT" }), { passportAvailable: true, defaultMethod: "PASSPORT" });
  assert.deepEqual(resolvePublicSignInConfig({ passportAvailable: true, org: null, deployment: "PASSWORD" }), { passportAvailable: true, defaultMethod: "PASSWORD" });
});
test("parse and org hint shape", () => {
  assert.equal(parseSignInMethod("Password"), "PASSWORD");
  assert.equal(parseSignInMethod(7), null);
  assert.equal(cleanOrgHint("nile-lab"), "nile-lab");
  assert.equal(cleanOrgHint("a b; drop"), null);
  assert.equal(cleanOrgHint(undefined), null);
});
test("limiter allows max per window then blocks, then resets", () => {
  let t = 0; const ok = makeWindowLimiter(2, 1000, () => t);
  assert.equal(ok("ip"), true); assert.equal(ok("ip"), true); assert.equal(ok("ip"), false);
  assert.equal(ok("other"), true);
  t = 1500; assert.equal(ok("ip"), true);
});
