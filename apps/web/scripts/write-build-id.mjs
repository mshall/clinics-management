#!/usr/bin/env node
/**
 * Writes public/build-id.json and .build-id for Vite (deploy version + WEB_BUILD_ID on API).
 * CI sets GITHUB_SHA; local uses git short sha or dev timestamp.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(webRoot, "public");

function resolveBuildId() {
  const fromEnv = process.env.GITHUB_SHA?.trim() || process.env.VITE_BUILD_ID?.trim();
  if (fromEnv) return fromEnv.slice(0, 40);
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8", cwd: webRoot }).trim();
  } catch {
    return `dev-${Date.now()}`;
  }
}

const buildId = resolveBuildId();
const payload = { buildId, builtAt: new Date().toISOString() };

mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, "build-id.json"), `${JSON.stringify(payload)}\n`, "utf8");
writeFileSync(path.join(webRoot, ".build-id"), `${buildId}\n`, "utf8");
writeFileSync(path.join(webRoot, ".build-built-at"), `${payload.builtAt}\n`, "utf8");