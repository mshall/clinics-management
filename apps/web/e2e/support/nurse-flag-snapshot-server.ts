/**
 * DEV / E2E FIXTURE ONLY (never a real launch gate, never loaded by the app).
 * Serves a signed Kiorex flag snapshot in which every launch-locked flag has its gate marked satisfied, so a SECOND, throw-away Kiorly API
 * (port 3011, see scripts/nurse-e2e-stack.sh) can exercise the gated Nurse capabilities (care plans, structured MAR, family updates) in Playwright.
 * The shared dev stack (API 3010 / web 5174) is untouched: there those gates stay unrecorded and the web must show the awaiting-gate states.
 * Refuses to run when NODE_ENV=production.
 */
import { createServer } from "node:http";
import * as keysModule from "../../../api/src/feature-flags/feature-flag-keys";
import * as snapshotModule from "../../../api/src/feature-flags/kiorex-flag-snapshot";

// The API is CommonJS: depending on the loader the named exports live on the namespace or on `default`.
const pick = <T>(m: unknown, name: string): T => ((m as Record<string, unknown>)[name] ?? ((m as { default?: Record<string, unknown> }).default ?? {})[name]) as T;
const CLINIC_FLAG_DEFINITIONS = pick<readonly { key: string; class: string; scopes: readonly string[]; dependsOn: readonly string[]; launchLocked: boolean }[]>(keysModule, "CLINIC_FLAG_DEFINITIONS");
const signSnapshot = pick<(secret: string, s: never) => string>(snapshotModule, "signSnapshot");
const SNAPSHOT_PATH = pick<string>(snapshotModule, "SNAPSHOT_PATH");

if (process.env.NODE_ENV === "production") throw new Error("The E2E flag snapshot fixture must never run in production");
const port = Number(process.env.NURSE_E2E_FLAGS_PORT ?? 4101);
/** Comma separated flag keys whose gate stays UNSATISFIED (the "locked" stack shows the awaiting-gate states for real). */
const locked = new Set((process.env.NURSE_E2E_LOCKED_FLAGS ?? "").split(",").map((k) => k.trim()).filter(Boolean));
const secret = process.env.KIOREX_FLAGS_SECRET ?? "e2e_flags_secret";

const snapshot = {
  product: "kiorly-clinic",
  version: 1,
  generatedAt: new Date().toISOString(),
  flags: CLINIC_FLAG_DEFINITIONS.map((d) => ({ key: d.key, class: d.class, scopes: [...d.scopes], dependsOn: [...d.dependsOn], launchLocked: d.launchLocked, gateSatisfied: !locked.has(d.key), values: {} })),
};
const body = JSON.stringify({ ...snapshot, signature: signSnapshot(secret, snapshot as never) });

createServer((req, res) => {
  if (!req.url?.startsWith(SNAPSHOT_PATH)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json", etag: '"e2e-1"' }).end(body);
}).listen(port, "127.0.0.1", () => console.log(`E2E flag snapshot fixture on http://127.0.0.1:${port}`));
