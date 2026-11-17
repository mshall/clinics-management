#!/usr/bin/env node
/**
 * After `cdk synth`, fail if the App Runner VPC connector name would trigger replacement churn.
 * Frankfurt must stay on `kiorly-clinic-connector` (owned by the live stack). Interim names from
 * failed deploys (v2, stack-scoped slugs) collide with orphans and fail HandlerErrorCode AlreadyExists.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRANKFURT_STACK_NAME = "kiorly-clinics-management";
const FRANKFURT_CONNECTOR_NAME = "kiorly-clinic-connector";
const FORBIDDEN_NAMES = new Set([
  "kiorly-clinic-connector-v2",
  "kiorly-conn-nagement",
]);

const cdkOut = join(dirname(fileURLToPath(import.meta.url)), "..", "cdk.out");
const stackName = process.env.CDK_STACK_NAME ?? FRANKFURT_STACK_NAME;
const templateFile = `${stackName}.template.json`;
const templatePath = join(cdkOut, templateFile);
let failed = false;

if (!readdirSync(cdkOut).includes(templateFile)) {
  console.error(`check-apprunner-connector-cfn: missing ${templatePath} — run cdk synth for ${stackName} first`);
  process.exit(1);
}

const template = JSON.parse(readFileSync(templatePath, "utf8"));
for (const [resourceId, resource] of Object.entries(template.Resources ?? {})) {
  if (resource.Type !== "AWS::AppRunner::VpcConnector") continue;
  const name = resource.Properties?.VpcConnectorName;
  if (FORBIDDEN_NAMES.has(name)) {
    console.error(
      `${templatePath}: ${resourceId} VpcConnectorName is "${name}" — orphan-prone interim name; ` +
        `use ${FRANKFURT_CONNECTOR_NAME} for frankfurt`,
    );
    failed = true;
  }
  if (stackName === FRANKFURT_STACK_NAME && name !== FRANKFURT_CONNECTOR_NAME) {
    console.error(
      `${templatePath}: ${resourceId} VpcConnectorName is "${name}" — ${FRANKFURT_STACK_NAME} must use ${FRANKFURT_CONNECTOR_NAME}`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check-apprunner-connector-cfn: OK");