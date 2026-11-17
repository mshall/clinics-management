#!/usr/bin/env node
/**
 * After `cdk synth`, fail if the App Runner VPC connector still uses the legacy global name
 * `kiorly-clinic-connector`. CloudFormation replace (tags, subnet order, etc.) creates a second
 * connector with the same name and fails with HandlerErrorCode AlreadyExists.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LEGACY_CONNECTOR_NAME = "kiorly-clinic-connector";
const cdkOut = join(dirname(fileURLToPath(import.meta.url)), "..", "cdk.out");
const stackName = process.env.CDK_STACK_NAME ?? "kiorly-clinics-management";
const templateFile = `${stackName}.template.json`;
const templatePath = join(cdkOut, templateFile);
let failed = false;

if (!readdirSync(cdkOut).includes(templateFile)) {
  console.error(`check-apprunner-connector-cfn: missing ${templatePath} — run cdk synth for ${stackName} first`);
  process.exit(1);
}

for (const file of [templateFile]) {
  const templatePath = join(cdkOut, file);
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  for (const [resourceId, resource] of Object.entries(template.Resources ?? {})) {
    if (resource.Type !== "AWS::AppRunner::VpcConnector") continue;
    const name = resource.Properties?.VpcConnectorName;
    if (name === LEGACY_CONNECTOR_NAME) {
      console.error(
        `${templatePath}: ${resourceId} VpcConnectorName is "${LEGACY_CONNECTOR_NAME}" — ` +
          "VPC connector replacement must use a new global name (e.g. kiorly-clinic-connector-v2 or kiorly-conn-<cell>)",
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("check-apprunner-connector-cfn: OK");