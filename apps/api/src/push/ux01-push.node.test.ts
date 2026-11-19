import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const API_ROOT = join(__dirname, "../..");
const WEB_ROOT = join(__dirname, "../../../web");
const DOCS = join(__dirname, "../../../../Docs");

describe("UX-01 PWA push", () => {
  it("PushSubscription migration and schema exist", () => {
    const mig = join(API_ROOT, "prisma/migrations/20261119210000_ux01_push_subscriptions/migration.sql");
    assert.equal(existsSync(mig), true);
    const schema = readFileSync(join(API_ROOT, "prisma/schema.prisma"), "utf8");
    assert.match(schema, /model PushSubscription/);
  });

  it("POST /push/subscriptions is exposed on PushController", () => {
    const src = readFileSync(join(__dirname, "push.controller.ts"), "utf8");
    assert.match(src, /@Controller\("push"\)/);
    assert.match(src, /@Post\("subscriptions"\)/);
  });

  it("web has vite-plugin-pwa manifest and offline today route", () => {
    const vite = readFileSync(join(WEB_ROOT, "vite.config.ts"), "utf8");
    assert.match(vite, /VitePWA/);
    assert.match(vite, /kiorly-today-offline/);
    const router = readFileSync(join(WEB_ROOT, "src/app/router.tsx"), "utf8");
    assert.match(router, /offline\/today/);
    const en = JSON.parse(readFileSync(join(WEB_ROOT, "src/locales/en.json"), "utf8")) as { pwa: Record<string, string> };
    const ar = JSON.parse(readFileSync(join(WEB_ROOT, "src/locales/ar.json"), "utf8")) as { pwa: Record<string, string> };
    assert.deepEqual(Object.keys(en.pwa).sort(), Object.keys(ar.pwa).sort());
  });

  it("NH-021 tracks VAPID / iOS install ops", () => {
    const nh = readFileSync(join(DOCS, "KIORLY_NEEDS_HUMAN.md"), "utf8");
    assert.match(nh, /NH-021/);
  });
});
