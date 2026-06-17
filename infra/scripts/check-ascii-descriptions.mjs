#!/usr/bin/env node
/**
 * EC2 SecurityGroup GroupDescription and ingress rule Description must be ASCII-only
 * (AWS API rejects UTF-8). Catches em-dashes and other Unicode before CloudFormation deploy.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const nonAscii = /[^\x00-\x7F]/;
const patterns = [
  { name: "CDK description", regex: /description:\s*"([^"]*)"/g },
  { name: "allowFrom rule description", regex: /\.allowFrom\s*\([\s\S]*?"([^"]*)"\s*\)/g },
];

let failed = false;

for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
  const path = join(srcDir, file);
  const content = readFileSync(path, "utf8");
  for (const { name, regex } of patterns) {
    for (const match of content.matchAll(regex)) {
      const value = match[1];
      if (nonAscii.test(value)) {
        console.error(`${path}: non-ASCII ${name}: "${value}"`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
