import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePilotTierArg, PILOT_TENANT_SPECS, PILOT_TIERS } from "./pilot-tenant-catalog";
import { ETA_PREPROD_BASE_URL, isStagingProfile } from "./staging-profile";

describe("QA-06 sales demo", () => {
  it("defines Lite, Pro, and Clinic pilot tenants", () => {
    assert.equal(PILOT_TIERS.length, 3);
    assert.equal(PILOT_TENANT_SPECS.lite.planKey, "LITE");
    assert.equal(PILOT_TENANT_SPECS.pro.planKey, "PRO");
    assert.equal(PILOT_TENANT_SPECS.clinic.planKey, "CLINIC");
  });

  it("parses demo reset tier arguments", () => {
    assert.equal(parsePilotTierArg("lite"), "lite");
    assert.equal(parsePilotTierArg("all"), "all");
    assert.equal(parsePilotTierArg(undefined), "all");
    assert.equal(parsePilotTierArg("enterprise"), null);
  });

  it("uses ETA pre-production host in staging profile", () => {
    const prev = process.env.KIORLY_ENV;
    process.env.KIORLY_ENV = "staging";
    assert.equal(isStagingProfile(), true);
    assert.ok(ETA_PREPROD_BASE_URL.includes("preprod"));
    process.env.KIORLY_ENV = prev;
  });

  it("reset-sales-demo CLI is registered in package scripts", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.ok(pkg.scripts?.["demo:reset"]);
    const rootPkg = JSON.parse(readFileSync(join(process.cwd(), "../../package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.ok(rootPkg.scripts?.["demo:reset"]);
  });
});