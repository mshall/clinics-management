#!/usr/bin/env node
/**
 * After `cdk synth`, verify EC2 SecurityGroup GroupDescription and ingress/egress
 * rule Description fields in CloudFormation templates are ASCII-only (AWS rejects UTF-8).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cdkOutDir = join(dirname(fileURLToPath(import.meta.url)), "..", "cdk.out");
const nonAscii = /[^\x00-\x7F]/;

function checkString(label, value) {
  if (typeof value !== "string") {
    return true;
  }
  if (nonAscii.test(value)) {
    console.error(`${label}: non-ASCII "${value}"`);
    return false;
  }
  return true;
}

function checkRuleDescriptions(label, rules) {
  if (!Array.isArray(rules)) {
    return true;
  }
  let ok = true;
  for (const [index, rule] of rules.entries()) {
    if (!checkString(`${label}[${index}].Description`, rule?.Description)) {
      ok = false;
    }
  }
  return ok;
}

let failed = false;

for (const file of readdirSync(cdkOutDir).filter((f) => f.endsWith(".template.json"))) {
  const path = join(cdkOutDir, file);
  const template = JSON.parse(readFileSync(path, "utf8"));
  const resources = template.Resources ?? {};

  for (const [logicalId, resource] of Object.entries(resources)) {
    if (resource.Type !== "AWS::EC2::SecurityGroup") {
      continue;
    }
    const props = resource.Properties ?? {};
    const prefix = `${path} ${logicalId}`;

    if (!checkString(`${prefix} GroupDescription`, props.GroupDescription)) {
      failed = true;
    }
    if (!checkRuleDescriptions(`${prefix} SecurityGroupIngress`, props.SecurityGroupIngress)) {
      failed = true;
    }
    if (!checkRuleDescriptions(`${prefix} SecurityGroupEgress`, props.SecurityGroupEgress)) {
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
