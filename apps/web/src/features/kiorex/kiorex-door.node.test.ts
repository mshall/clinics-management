/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { doorAr, doorEn } from "./kiorex-door-strings";
import { marketingAr, marketingEn } from "./kiorex-marketing-strings";
import { en as connectEn } from "./kiorex-connect-strings";

const here = dirname(fileURLToPath(import.meta.url));
const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const values = (o: Record<string, unknown>): string[] => Object.values(o).flatMap((v) => (typeof v === "object" && v ? values(v as Record<string, unknown>) : [String(v)]));

describe("Kiorex front door (ADR-040): wording and bundles", () => {
  it("marketing and door bundles have identical AR/EN keys, no empty values and the same placeholders", () => {
    for (const [e, a] of [[marketingEn, marketingAr], [doorEn, doorAr]] as const) {
      assert.deepEqual(flat(e).sort(), flat(a).sort());
      const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
      const ev = flat(e).map((k) => k.split(".").reduce((x: any, p) => x[p], e as any) as string);
      const av = flat(a).map((k) => k.split(".").reduce((x: any, p) => x[p], a as any) as string);
      ev.forEach((v, i) => { assert.ok(v.length > 0 && av[i]!.length > 0); assert.equal(ph(v), ph(av[i]!), flat(e)[i]); });
    }
  });
  it("marketing wording never states a price, percentage or patient number (fees come only from the published schedule)", () => {
    for (const v of [...values(marketingEn), ...values(marketingAr)]) assert.equal(/[0-9٠-٩]/.test(v.replace(/\{\{\w+\}\}/g, "")), false, v);
    assert.equal(/(EGP|SAR|AED|USD|\$|£|جنيه)/i.test(values(marketingEn).join(" ") + values(marketingAr).join(" ")), false);
  });
  it("every static kiorexMarketing / kiorexDoor key used by the front-door files exists in both languages", () => {
    const keys = new Set([...flat(marketingEn).map((k) => `kiorexMarketing.${k}`), ...flat(doorEn).map((k) => `kiorexDoor.${k}`), ...flat(connectEn).map((k) => `kiorexConnect.${k}`)]);
    const used = new Set<string>();
    for (const f of readdirSync(here).filter((x) => /^kiorex-(landing|progress-panel|live-dashboard|home-card|page)\.tsx$/.test(x))) {
      for (const m of readFileSync(join(here, f), "utf8").matchAll(/\bt\(\s*["'`]((?:kiorexMarketing|kiorexDoor|kiorexConnect)\.[a-zA-Z0-9_.]+)["'`]/g)) used.add(m[1]!);
    }
    assert.ok(used.size > 25);
    assert.deepEqual([...used].filter((k) => !keys.has(k)), []);
  });
  it("only the marketing namespace file contains the promotional copy (single place to edit); the file is flagged NEEDS_HUMAN", () => {
    const src = readFileSync(join(here, "kiorex-marketing-strings.ts"), "utf8");
    assert.match(src, /NEEDS_HUMAN/);
    for (const f of readdirSync(here).filter((x) => /\.tsx$/.test(x))) assert.equal(readFileSync(join(here, f), "utf8").includes("Reach more patients"), false, f);
  });
});

describe("per-user card dismissal (server first, browser fallback, one-time migration)", () => {
  it("keeps keys unique and sorted, and migrates a browser-only dismissal exactly once", async () => {
    const { withKey, needsMigration, HOME_CARD_KEY } = await import("./dismissed-cards-logic");
    assert.deepEqual(withKey(["b", HOME_CARD_KEY], HOME_CARD_KEY, true), ["b", HOME_CARD_KEY]);
    assert.deepEqual(withKey(["b", HOME_CARD_KEY], HOME_CARD_KEY, false), ["b"]);
    assert.equal(needsMigration([], true), true);
    assert.equal(needsMigration([HOME_CARD_KEY], true), false);
    assert.equal(needsMigration([], false), false);
  });
});
