import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SIGN_IN_METHOD_KEY, parseSignInMethod, readSignInMethod, rememberSignInMethod, resolveSignInMethod } from "./sign-in-method";

const memoryStore = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe("sign-in method: Kiorex Passport is the default", () => {
  it("is Passport on a fresh device when Passport is offered", () => {
    assert.equal(resolveSignInMethod(true, null), "passport");
    assert.equal(resolveSignInMethod(true, undefined), "passport");
  });
  it("preselects the last method used (password or passport)", () => {
    assert.equal(resolveSignInMethod(true, "password"), "password");
    assert.equal(resolveSignInMethod(true, "passport"), "passport");
  });
  it("ignores garbage in storage", () => {
    for (const v of ["", "sms", "PASSWORD", 1, {}]) assert.equal(resolveSignInMethod(true, v), "passport", String(v));
    assert.equal(parseSignInMethod("otp"), null);
  });
  it("shows only the password when the API does not offer Passport, whatever was remembered", () => {
    assert.equal(resolveSignInMethod(false, null), "password");
    assert.equal(resolveSignInMethod(false, "passport"), "password");
  });
});

describe("last-method memory", () => {
  it("remembers a password sign-in and a Passport sign-in, per storage", () => {
    const s = memoryStore();
    assert.equal(readSignInMethod(s), null);
    rememberSignInMethod("password", s);
    assert.equal(s.m.get(SIGN_IN_METHOD_KEY), "password");
    assert.equal(resolveSignInMethod(true, readSignInMethod(s)), "password");
    rememberSignInMethod("passport", s);
    assert.equal(resolveSignInMethod(true, readSignInMethod(s)), "passport");
  });
  it("survives blocked storage (private mode) without throwing", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    assert.equal(readSignInMethod(blocked), null);
    assert.doesNotThrow(() => rememberSignInMethod("password", blocked));
    assert.equal(readSignInMethod(null), null);
    assert.doesNotThrow(() => rememberSignInMethod("password", null));
  });
});
