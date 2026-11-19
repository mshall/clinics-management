import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isMock, providerMode, providerModes } from "./provider-mode";

const KEYS = [
  "KIORLY_PROVIDER_MODE",
  "KIORLY_PROVIDER_MODE_EMAIL",
  "KIORLY_PROVIDER_MODE_WHATSAPP",
  "KIORLY_PROVIDER_MODE_PSP",
  "EMAIL_SES_ENABLED",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_API_TOKEN",
  "NODE_ENV",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function reset() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe("provider mode: every integration is MOCK by default", () => {
  afterEach(reset);

  it("defaults to mock for every kind, in any NODE_ENV, with no configuration", () => {
    for (const k of KEYS) if (k !== "NODE_ENV") delete process.env[k];
    for (const env of ["test", "development", "production"]) {
      process.env.NODE_ENV = env;
      assert.deepEqual(Object.values(providerModes()), ["mock", "mock", "mock", "mock", "mock"], env);
    }
  });

  it("per-kind mode beats the global mode; only 'real' turns real on", () => {
    for (const k of KEYS) if (k !== "NODE_ENV") delete process.env[k];
    process.env.KIORLY_PROVIDER_MODE = "real";
    process.env.KIORLY_PROVIDER_MODE_WHATSAPP = "mock";
    assert.equal(providerMode("email"), "real");
    assert.equal(providerMode("whatsapp"), "mock");
    process.env.KIORLY_PROVIDER_MODE = "yes-please";
    delete process.env.KIORLY_PROVIDER_MODE_WHATSAPP;
    assert.equal(isMock("email"), true, "unknown values fall back to mock");
  });

  it("a production deployment with the legacy enabling switch keeps working until the mode is set explicitly", () => {
    for (const k of KEYS) if (k !== "NODE_ENV") delete process.env[k];
    process.env.NODE_ENV = "production";
    process.env.EMAIL_SES_ENABLED = "1";
    assert.equal(providerMode("email"), "real");
    process.env.KIORLY_PROVIDER_MODE_EMAIL = "mock";
    assert.equal(providerMode("email"), "mock", "explicit mode wins");
    process.env.NODE_ENV = "development";
    delete process.env.KIORLY_PROVIDER_MODE_EMAIL;
    assert.equal(providerMode("email"), "mock", "legacy switch never makes dev real");
  });
});
