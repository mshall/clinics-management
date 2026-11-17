import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { appRunnerPhysicalNames } from "./apprunner-physical-names";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("App Runner infra naming", () => {
  it("uses frankfurt v2 connector name (tag-driven CFN replace cannot reuse legacy name)", () => {
    assert.deepEqual(appRunnerPhysicalNames("frankfurt"), {
      vpcConnectorName: "kiorly-clinic-connector-v2",
      autoScalingName: "kiorly-api-autoscale",
      observabilityName: "kiorly-api-observability",
    });
    assert.equal(appRunnerPhysicalNames("cairo").vpcConnectorName, "kiorly-conn-cairo");
  });

  it("wires appRunnerPhysicalNames and sorts public subnet ids in the stack", () => {
    const src = readFileSync(join(__dirname, "kiorly-clinics-management-stack.ts"), "utf8");
    assert.ok(src.includes("appRunnerPhysicalNames(hostCell)"));
    assert.ok(!src.includes("kiorly-conn-${appRunnerResourceSuffix}"));
    assert.ok(src.includes(".sort()"), "public subnet ids should be sorted to avoid spurious replacement");
    assert.ok(
      src.includes("excludeStackResidencyTags(vpcConnector)"),
      "VpcConnector must not inherit stack tags (CFN replacement AlreadyExists)",
    );
  });
});