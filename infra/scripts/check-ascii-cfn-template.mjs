#!/usr/bin/env node
/**
 * After `cdk synth`, validate synthesized CloudFormation templates:
 * - EC2 SecurityGroup GroupDescription and rule Description are ASCII-only (AWS rejects UTF-8).
 * - App Runner HealthCheckConfiguration.UnhealthyThreshold is within AWS limits (1-20).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cdkOut = join(dirname(fileURLToPath(import.meta.url)), "..", "cdk.out");
const nonAscii = /[^\x00-\x7F]/;
const APP_RUNNER_MAX_UNHEALTHY_THRESHOLD = 20;
let failed = false;

function checkString(templateFile, resourceId, field, value) {
  if (typeof value !== "string" || !nonAscii.test(value)) return;
  console.error(`${templateFile}: ${resourceId} ${field} has non-ASCII: "${value}"`);
  failed = true;
}

function scanSecurityGroup(templateFile, resourceId, props) {
  checkString(templateFile, resourceId, "GroupDescription", props?.GroupDescription);
  for (const ruleList of [props?.SecurityGroupIngress, props?.SecurityGroupEgress]) {
    if (!Array.isArray(ruleList)) continue;
    for (const [index, rule] of ruleList.entries()) {
      checkString(templateFile, `${resourceId}.rule[${index}]`, "Description", rule?.Description);
    }
  }
}

function scanAppRunnerService(templateFile, resourceId, props) {
  const threshold = props?.HealthCheckConfiguration?.UnhealthyThreshold;
  if (threshold == null) return;
  if (typeof threshold !== "number" || threshold < 1 || threshold > APP_RUNNER_MAX_UNHEALTHY_THRESHOLD) {
    console.error(
      `${templateFile}: ${resourceId} HealthCheckConfiguration.UnhealthyThreshold must be 1-${APP_RUNNER_MAX_UNHEALTHY_THRESHOLD} (got ${threshold})`,
    );
    failed = true;
  }
}

for (const file of readdirSync(cdkOut).filter((f) => f.endsWith(".template.json"))) {
  const templatePath = join(cdkOut, file);
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  for (const [resourceId, resource] of Object.entries(template.Resources ?? {})) {
    if (resource.Type === "AWS::EC2::SecurityGroup") {
      scanSecurityGroup(templatePath, resourceId, resource.Properties ?? {});
      continue;
    }
    if (resource.Type === "AWS::EC2::SecurityGroupIngress" || resource.Type === "AWS::EC2::SecurityGroupEgress") {
      checkString(templatePath, resourceId, "Description", resource.Properties?.Description);
      continue;
    }
    if (resource.Type === "AWS::AppRunner::Service") {
      scanAppRunnerService(templatePath, resourceId, resource.Properties ?? {});
    }
  }
}

if (failed) {
  process.exit(1);
}
