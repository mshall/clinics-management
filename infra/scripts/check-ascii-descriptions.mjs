#!/usr/bin/env node
/**
 * EC2 SecurityGroup GroupDescription and ingress rule Description must be ASCII-only
 * (AWS API rejects UTF-8). Catches em-dashes and other Unicode before CloudFormation deploy.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const cdkOutDir = join(dirname(fileURLToPath(import.meta.url)), "..", "cdk.out");
const nonAscii = /[^\x00-\x7F]/;
const patterns = [
  { name: "CDK description", regex: /description:\s*"([^"]*)"/g },
  { name: "allowFrom rule description", regex: /\.allowFrom\s*\([\s\S]*?"([^"]*)"\s*\)/g },
];

let failed = false;

function checkValue(path, name, value) {
  if (nonAscii.test(value)) {
    console.error(`${path}: non-ASCII ${name}: "${value}"`);
    failed = true;
  }
}

for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
  const path = join(srcDir, file);
  const content = readFileSync(path, "utf8");
  for (const { name, regex } of patterns) {
    for (const match of content.matchAll(regex)) {
      checkValue(path, name, match[1]);
    }
  }
}

try {
  for (const file of readdirSync(cdkOutDir).filter((f) => f.endsWith(".template.json"))) {
    const path = join(cdkOutDir, file);
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(/"GroupDescription"\s*:\s*"([^"]*)"/g)) {
      checkValue(path, "CloudFormation GroupDescription", match[1]);
    }
  }
} catch {
  /* cdk.out not synthesized yet — source scan is enough for PR checks */
}

if (failed) {
  process.exit(1);
}
