#!/usr/bin/env node
// Asserts no "Test users" panel, demo hint or synthetic credential is in ANY build (production and development mode).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MARKERS = ["Test users", "use password \"demo\"", "any 6 digits", "Test users (dev only)", "مستخدمو الاختبار (للتطوير فقط)", "Demo@12345", "owner.na@demo.kiorex.test", "dev-test-users"];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// A production build must not point at a local service: no localhost / loopback / .test URL survives, apart from constants INSIDE bundled libraries (listed with the reason).
const BENIGN = [
  /new URL\(`http:\/\/localhost`\)/g, /=`http:\/\/localhost`/g, /=["']http:\/\/localhost["']/g, /\|localhost\)\/i/g, /new URL\([a-z],`http:\/\/127\.0\.0\.1`\)/g, /new URL\([a-z],["']http:\/\/127\.0\.0\.1["']\)/g,
];
// a URL that names a local service; a bare hostname comparison such as `hostname === "localhost"` (is the page itself on a dev host?) is not a pointer to one
const LOCAL = /(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])|https?:\/\/[^\s"'`\/]+\.test(?![\w(])/;
const localHits = (dir) => walk(dir).filter((f) => /\.(js|mjs|html|json|css|webmanifest)$/.test(f)).flatMap((f) => { const raw = BENIGN.reduce((a, re) => a.replace(re, ""), readFileSync(f, "utf8")); const m = LOCAL.exec(raw); return m ? [`${f}: local address "${raw.slice(Math.max(0, m.index - 50), m.index + 40).replace(/\s+/g, " ")}"`] : []; });
const hits = (dir) => walk(dir).filter((f) => /\.(js|mjs|html|json|css|map)$/.test(f)).flatMap((f) => { const s = readFileSync(f, "utf8"); return MARKERS.filter((m) => s.includes(m)).map((m) => `${f}: ${m}`); });
const build = (out, mode) => execFileSync("npx", ["vite", "build", "--mode", mode, "--outDir", out, "--emptyOutDir"], { stdio: "pipe", env: { ...process.env, NODE_ENV: mode === "production" ? "production" : "development" } });

const prod = mkdtempSync(join(tmpdir(), "kx-prod-")), dev = mkdtempSync(join(tmpdir(), "kx-dev-"));
try {
  build(prod, "production");
  const leaked = [...hits(prod), ...localHits(prod)];
  if (leaked.length) { console.error("FAIL: dev-only content (test users, local service address) found in the PRODUCTION build:\n" + leaked.join("\n")); process.exit(1); }
  build(dev, "development");
  const devLeaked = hits(dev);
  if (devLeaked.length) { console.error("FAIL: demo/test-user content found in the DEVELOPMENT build:\n" + devLeaked.join("\n")); process.exit(1); }
  console.log("OK: no test users or demo hints in any build; no local address in the production build");
} finally { rmSync(prod, { recursive: true, force: true }); rmSync(dev, { recursive: true, force: true }); }
