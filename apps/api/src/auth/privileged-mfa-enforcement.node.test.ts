import assert from "node:assert/strict";
import { test } from "node:test";
import { privilegedMfaEnforced } from "./privileged-mfa-enforcement";

test("privileged MFA not enforced locally without AWS deploy target", () => {
  const env = process.env.NODE_ENV;
  const deploy = process.env.KIORLY_DEPLOY_TARGET;
  process.env.NODE_ENV = "production";
  delete process.env.KIORLY_DEPLOY_TARGET;
  delete process.env.AWS_EXECUTION_ENV;
  delete process.env.AWS_REGION;
  delete process.env.PRIVILEGED_MFA_ENFORCE;
  assert.equal(privilegedMfaEnforced(), false);
  process.env.KIORLY_DEPLOY_TARGET = "aws";
  assert.equal(privilegedMfaEnforced(), true);
  if (env === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = env;
  if (deploy === undefined) delete process.env.KIORLY_DEPLOY_TARGET;
  else process.env.KIORLY_DEPLOY_TARGET = deploy;
});