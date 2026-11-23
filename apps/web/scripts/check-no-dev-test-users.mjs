#!/usr/bin/env node
// Asserts the DEV ONLY "Test users (dev only)" panel and its synthetic credentials are NOT in a production build,
// and (sanity) that they ARE in a development-mode build, so the check cannot pass vacuously.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MARKERS = ["Test users (dev only)", "مستخدمو الاختبار (للتطوير فقط)", "Demo@12345", "owner.na@demo.kiorex.test", "dev-test-users"];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const hits = (dir) => walk(dir).filter((f) => /\.(js|mjs|html|json|css|map)$/.test(f)).flatMap((f) => { const s = readFileSync(f, "utf8"); return MARKERS.filter((m) => s.includes(m)).map((m) => `${f}: ${m}`); });
const build = (out, mode) => execFileSync("npx", ["vite", "build", "--mode", mode, "--outDir", out, "--emptyOutDir"], { stdio: "pipe", env: { ...process.env, NODE_ENV: mode === "production" ? "production" : "development" } });

const prod = mkdtempSync(join(tmpdir(), "kx-prod-")), dev = mkdtempSync(join(tmpdir(), "kx-dev-"));
try {
  build(prod, "production");
  const leaked = hits(prod);
  if (leaked.length) { console.error("FAIL: dev test users found in the PRODUCTION build:\n" + leaked.join("\n")); process.exit(1); }
  build(dev, "development");
  if (!hits(dev).length) { console.error("FAIL: sanity check, the development build does not contain the panel (check is vacuous)"); process.exit(1); }
  console.log("OK: dev test users absent from the production build, present in the development build");
} finally { rmSync(prod, { recursive: true, force: true }); rmSync(dev, { recursive: true, force: true }); }
