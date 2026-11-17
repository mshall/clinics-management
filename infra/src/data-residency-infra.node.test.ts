import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const infraDir = join(__dirname, "..");

const synthEnvBase = {
  ...process.env,
  CDK_DEFAULT_ACCOUNT: "111111111111",
  AWS_EC2_METADATA_DISABLED: "true",
};

function synthTemplate(hostCell: string): Record<string, unknown> {
  execFileSync("npm", ["run", "build"], { cwd: infraDir, stdio: "pipe" });
  execFileSync(
    "npx",
    ["cdk", "synth", "-c", `hostCell=${hostCell}`, "-c", "deployRegion=eu-central-1", "--quiet"],
    {
      cwd: infraDir,
      stdio: "pipe",
      env: synthEnvBase,
      timeout: 180_000,
    },
  );
  const stackId = hostCell === "frankfurt" ? "kiorly-clinics-management" : `kiorly-cell-${hostCell}`;
  const templatePath = join(infraDir, "cdk.out", `${stackId}.template.json`);
  return JSON.parse(readFileSync(templatePath, "utf8")) as Record<string, unknown>;
}

function resourcesTagged(template: Record<string, unknown>, key: string, value: string): string[] {
  const resources = template.Resources as Record<string, { Properties?: { Tags?: Array<{ Key: string; Value: string }> } }>;
  const hits: string[] = [];
  for (const [id, res] of Object.entries(resources ?? {})) {
    const tags = res.Properties?.Tags;
    if (tags?.some((t) => t.Key === key && t.Value === value)) hits.push(id);
  }
  return hits;
}

describe("SC-01 CDK cell tagging", () => {
  it("frankfurt stack tags RDS and uploads bucket with KiorlyHostCell", () => {
    const template = synthTemplate("frankfurt");
    const tagged = resourcesTagged(template, "KiorlyHostCell", "frankfurt");
    assert.ok(tagged.some((id) => id.includes("Postgres")), "RDS Postgres must carry host cell tag");
    assert.ok(tagged.some((id) => id.includes("ApiUploads")), "uploads bucket must carry host cell tag");
    const outputs = template.Outputs as Record<string, { Value: string }>;
    assert.equal(outputs.HostCell?.Value, "frankfurt");
    assert.equal(outputs.DataRegion?.Value, "eu-central-1");
  });

  it("cairo stack synthesizes separate stack id and me-south-1 region", () => {
    execFileSync("npm", ["run", "build"], { cwd: infraDir, stdio: "pipe" });
    const synthEnv = {
      ...synthEnvBase,
      CDK_DEFAULT_REGION: "me-south-1",
    };
    execFileSync(
      "npx",
      ["cdk", "synth", "-c", "hostCell=cairo", "-c", "deployRegion=me-south-1", "--quiet"],
      { cwd: infraDir, stdio: "pipe", env: synthEnv, timeout: 180_000 },
    );
    const templatePath = join(infraDir, "cdk.out", "kiorly-cell-cairo.template.json");
    const template = JSON.parse(readFileSync(templatePath, "utf8")) as Record<string, unknown>;
    const outputs = template.Outputs as Record<string, { Value: string }>;
    assert.equal(outputs.HostCell?.Value, "cairo");
    assert.equal(outputs.DataRegion?.Value, "me-south-1");
  });
});