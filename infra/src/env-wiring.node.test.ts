import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadClinicEnvConfig, validateClinicEnvConfig, wiringEnvVars, wiringSecretNames, type ClinicEnvConfig } from "./env-wiring";

const ok: ClinicEnvConfig = {
  environment: "t",
  env: { APP_WEB_URL: "https://clinics.example.test", KIOREX_OIDC_ISSUER: "https://passport.example.test", KIOREX_OIDC_CLIENT_ID: "kiorly-clinic" },
  secrets: { KIOREX_OIDC_CLIENT_SECRET: { secretName: "/kx/test/clinic", key: "KIOREX_OIDC_CLIENT_SECRET" } },
};

describe("Clinic env wiring config", () => {
  it("accepts a clean config and emits sorted env vars and distinct secret names", () => {
    assert.deepEqual(validateClinicEnvConfig(ok), []);
    assert.deepEqual(wiringEnvVars(ok).map((e) => e.name), ["APP_WEB_URL", "KIOREX_OIDC_CLIENT_ID", "KIOREX_OIDC_ISSUER"]);
    assert.deepEqual(wiringSecretNames(ok), ["/kx/test/clinic"]);
  });
  it("is a no-op without a config", () => {
    assert.deepEqual(wiringEnvVars(null), []);
    assert.deepEqual(wiringSecretNames(null), []);
  });
  it("refuses reserved names, secret-looking plain values, localhost, http and duplicates", () => {
    const bad: ClinicEnvConfig = {
      environment: "t",
      env: { DB_SECRET_ARN: "x", KIOREX_OUTBOX_WEBHOOK_SECRET: "abc", APP_WEB_URL: "http://localhost:5174", OTHER_URL: "http://example.test", dup: "x" } as Record<string, string>,
      secrets: { JWT_SECRET: { secretName: "/a", key: "k" }, KIOREX_OUTBOX_WEBHOOK_SECRET: { secretName: "no-slash", key: "bad key" } },
    };
    const p = validateClinicEnvConfig(bad).join("\n");
    for (const needle of ["DB_SECRET_ARN: reserved", "KIOREX_OUTBOX_WEBHOOK_SECRET: looks like a secret", "localhost", "http URL", "dup: invalid variable name", "JWT_SECRET: reserved", "also given as a plain env value", "secretName must be", "key must be"]) assert.ok(p.includes(needle), `missing: ${needle}\n${p}`);
  });
  it("loads a file, returns null when absent and throws on an invalid file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kx-env-"));
    assert.equal(loadClinicEnvConfig(dir, "none.json"), null);
    writeFileSync(join(dir, "a.json"), JSON.stringify(ok));
    assert.equal(loadClinicEnvConfig(dir, "a.json")?.env.APP_WEB_URL, "https://clinics.example.test");
    writeFileSync(join(dir, "b.json"), JSON.stringify({ env: { PORT: "1" } }));
    assert.throws(() => loadClinicEnvConfig(dir, "b.json"), /reserved/);
  });
});
