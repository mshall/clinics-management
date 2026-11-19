import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WEB = join(import.meta.dirname, "..");

describe("UX-02 mobile-first doctor views", () => {
  it("AppShell mounts MobileBottomNav with safe bottom padding", () => {
    const shell = readFileSync(join(WEB, "app/layouts/app-shell.tsx"), "utf8");
    assert.match(shell, /MobileBottomNav/);
    assert.match(shell, /pb-20/);
  });

  it("bottom nav targets Today, patients, encounters, Kiorex on phone", () => {
    const nav = readFileSync(join(WEB, "components/mobile-bottom-nav.tsx"), "utf8");
    assert.match(nav, /md:hidden/);
    assert.match(nav, /to: "\/"/);
    assert.match(nav, /to: "\/patients"/);
    assert.match(nav, /to: "\/encounters"/);
    assert.match(nav, /to: "\/kiorex"/);
    assert.match(nav, /data-testid="mobile-bottom-nav"/);
  });

  it("EN/AR nav strings for mobile bottom exist", () => {
    const en = JSON.parse(readFileSync(join(WEB, "locales/en.json"), "utf8")) as { nav: Record<string, string> };
    const ar = JSON.parse(readFileSync(join(WEB, "locales/ar.json"), "utf8")) as { nav: Record<string, string> };
    for (const k of ["mobileToday", "mobileMore", "mobileBottom"]) {
      assert.ok(en.nav[k], `missing en.nav.${k}`);
      assert.ok(ar.nav[k], `missing ar.nav.${k}`);
    }
  });
});
