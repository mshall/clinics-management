import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBillingMfaPath,
  mfaGraceExpired,
  PRIVILEGED_MFA_GRACE_DAYS,
  privilegedMfaEnforced,
} from "./privileged-mfa-enforcement";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    const v = vars[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("SC-04 privileged MFA enforcement", () => {
  it("enforces on staging / production-like KIORLY_ENV, not local", () => {
    withEnv(
      {
        NODE_ENV: "production",
        KIORLY_ENV: "development",
        KIORLY_DEPLOY_TARGET: "local",
        AWS_EXECUTION_ENV: undefined,
        AWS_REGION: undefined,
        PRIVILEGED_MFA_ENFORCE: undefined,
      },
      () => assert.equal(privilegedMfaEnforced(), false),
    );
    withEnv(
      {
        NODE_ENV: "production",
        KIORLY_ENV: "staging",
        KIORLY_DEPLOY_TARGET: undefined,
        PRIVILEGED_MFA_ENFORCE: undefined,
      },
      () => assert.equal(privilegedMfaEnforced(), true),
    );
    withEnv(
      {
        NODE_ENV: "production",
        KIORLY_ENV: "production",
        KIORLY_DEPLOY_TARGET: "aws",
        PRIVILEGED_MFA_ENFORCE: "false",
      },
      () => assert.equal(privilegedMfaEnforced(), true),
    );
  });

  it("owner cannot access billing without MFA after day 7 (grace helper)", () => {
    const created = new Date("2026-11-01T00:00:00.000Z");
    assert.equal(mfaGraceExpired(created, new Date("2026-11-05T00:00:00.000Z")), false);
    assert.equal(
      mfaGraceExpired(created, new Date("2026-11-08T00:00:00.000Z")),
      true,
    );
    assert.equal(PRIVILEGED_MFA_GRACE_DAYS, 7);
    assert.equal(isBillingMfaPath("/api/v1/billing/invoices"), true);
    assert.equal(isBillingMfaPath("/api/v1/patients"), false);
  });
});
