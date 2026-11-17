import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Regression: fixed App Runner resource names (e.g. kiorly-clinic-connector) fail CDK deploy
 * with HandlerErrorCode AlreadyExists when CloudFormation replaces resources create-before-delete.
 */
describe("App Runner infra naming", () => {
  it("uses stack-scoped connector / autoscale / observability names", () => {
    const src = readFileSync(join(__dirname, "kiorly-clinics-management-stack.ts"), "utf8");
    assert.ok(
      !src.includes('vpcConnectorName: "kiorly-clinic-connector"'),
      "VpcConnector must not use a global fixed name",
    );
    assert.ok(src.includes("kiorly-conn-${appRunnerResourceSuffix}"));
    assert.ok(src.includes("kiorly-api-autoscale-${appRunnerResourceSuffix}"));
    assert.ok(src.includes("kiorly-api-obs-${appRunnerResourceSuffix}"));
    assert.ok(src.includes(".sort()"), "public subnet ids should be sorted to avoid spurious replacement");
  });
});