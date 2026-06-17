#!/usr/bin/env node
/**
 * After `cdk synth`, ensure synthesized CloudFormation templates use ASCII-only EC2
 * SecurityGroup GroupDescription and rule Description values (AWS rejects UTF-8).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cdkOut = join(dirname(fileURLToPath(import.meta.url)), "..", "cdk.out");
const nonAscii = /[^\x00-\x7F]/;
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
    }
  }
}

if (failed) {
  process.exit(1);
}
