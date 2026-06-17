#!/usr/bin/env node
/**
 * EC2 SecurityGroup GroupDescription must be ASCII-only (AWS API rejects UTF-8).
 * Catches em-dashes and other Unicode in CDK `description:` strings before deploy.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const nonAscii = /[^\x00-\x7F]/;
const descriptionPattern = /description:\s*"([^"]*)"/g;

let failed = false;

for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
  const path = join(srcDir, file);
  const content = readFileSync(path, "utf8");
  for (const match of content.matchAll(descriptionPattern)) {
    const value = match[1];
    if (nonAscii.test(value)) {
      console.error(`${path}: non-ASCII CDK description: "${value}"`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
