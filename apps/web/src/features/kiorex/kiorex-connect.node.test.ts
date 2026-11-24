/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ar, en } from "./kiorex-connect-strings";

const here = dirname(fileURLToPath(import.meta.url));
const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

describe("Connect to Kiorex wizard (web)", () => {
  it("Arabic and English bundles have identical keys and no empty strings", () => {
    assert.deepEqual(flat(en).sort(), flat(ar).sort());
    for (const v of [...flat(en), ...flat(ar)]) assert.ok(v.length > 0);
  });
  it("every static kiorexConnect key used by the wizard files exists in both languages", () => {
    const keys = new Set(flat(en));
    const used = new Set<string>();
    for (const f of readdirSync(here).filter((x) => /^kiorex-connect.*\.tsx$/.test(x))) {
      for (const m of readFileSync(join(here, f), "utf8").matchAll(/\bt\(\s*["'`](kiorexConnect\.[a-zA-Z0-9_.]+)["'`]/g)) used.add(m[1]!.replace("kiorexConnect.", ""));
    }
    assert.ok(used.size > 10);
    assert.deepEqual([...used].filter((k) => !keys.has(k)), []);
  });
  it("covers every API step key and status in both languages", () => {
    for (const k of ["subscription", "entitlement", "credentials", "appointment_types", "availability", "profile", "consent", "options", "request", "live"]) {
      assert.ok((en.step as Record<string, unknown>)[k] && (ar.step as Record<string, unknown>)[k], k);
    }
    for (const s of ["done", "action_needed", "waiting_kiorex", "blocked"]) assert.ok((en.state as Record<string, string>)[s]);
  });
  it("uses brand tokens and logical (RTL-safe) layout, no hard-coded colours", () => {
    for (const f of readdirSync(here).filter((x) => /^kiorex-connect.*\.tsx$/.test(x))) {
      const src = readFileSync(join(here, f), "utf8");
      assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b/, `${f} hard-coded hex`);
      assert.doesNotMatch(src, /\b(ml|mr|pl|pr|text-left|text-right)-/, `${f} uses physical direction classes`);
    }
  });
  it("never states a price: the fee comes from the published market config", () => {
    assert.doesNotMatch(JSON.stringify(en) + JSON.stringify(ar), /EGP\s*\d|\d+\s*جنيه/);
  });
  it("browser-walk regressions: AA status colours, decision banner, readable doctor states, Lite owners can reach the pages", () => {
    const page = readFileSync(join(here, "kiorex-connect-page.tsx"), "utf8");
    assert.match(page, /text-emerald-700 dark:text-emerald-400/); assert.match(page, /text-amber-700 dark:text-amber-400/); assert.match(page, /text-sky-700 dark:text-sky-400/);
    assert.doesNotMatch(page, /text-(emerald|amber|sky)-600/);
    for (const s of ["CHANGES_REQUESTED", "REJECTED", "PAUSED"]) { assert.ok((en as Record<string, any>).decision[s] && (ar as Record<string, any>).decision[s], s); }
    assert.match(page, /connect-decision/);
    for (const k of ["NONE", "VERIFIED"]) assert.ok((en as any).doctor.verif[k] && (ar as any).doctor.verif[k]);
    for (const k of ["DRAFT", "PENDING_VERIFICATION", "LIVE", "PAUSED"]) assert.ok((en as any).doctor.listing[k] && (ar as any).doctor.listing[k]);
    assert.doesNotMatch(page, /: \{x\.verification\} ·|: \{x\.status\}/); // raw enum values are never printed
    const router = readFileSync(join(here, "../../app/router.tsx"), "utf8"); // Lite plans have Admin but no Clinics tab: the Kiorex pages must stay reachable
    for (const c of ["KiorexPage", "KiorexConnectPage", "ClinicDetailPage", "MarketplaceListingProfilePage"]) assert.match(router, new RegExp(`<NavGate tab="clinics" orTab="admin">\\{defer\\(${c}\\)`));
  });
});
