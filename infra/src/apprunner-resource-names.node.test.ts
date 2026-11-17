import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { appRunnerPhysicalNames } from "./apprunner-physical-names";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("App Runner infra naming", () => {
  it("keeps frankfurt legacy connector/config names (no CFN replace AlreadyExists)", () => {
    assert.deepEqual(appRunnerPhysicalNames("frankfurt"), {
      vpcConnectorName: "kiorly-clinic-connector",
      autoScalingName: "kiorly-api-autoscale",
      observabilityName: "kiorly-api-observability",
    });
    assert.equal(appRunnerPhysicalNames("cairo").vpcConnectorName, "kiorly-conn-cairo");
  });

  it("wires appRunnerPhysicalNames and avoids lex-sort on VPC connector subnets", () => {
    const src = readFileSync(join(__dirname, "kiorly-clinics-management-stack.ts"), "utf8");
    assert.ok(src.includes("appRunnerPhysicalNames(hostCell)"));
    assert.ok(!src.includes("kiorly-conn-${appRunnerResourceSuffix}"));
    const connectorSlice = src.slice(
      src.indexOf('CfnVpcConnector(this, "AppRunnerVpcConnector"'),
      src.indexOf("const assetPath"),
    );
    assert.ok(
      !connectorSlice.includes(".sort()"),
      "lexicographic sort on connector subnets forces CloudFormation replacement",
    );
  });
});