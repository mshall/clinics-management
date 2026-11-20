import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  CLINIC_FLAG_DEFINITIONS,
  CLINIC_FLAG_KEYS,
  EXTERNAL_PARENT_FLAG_KEYS,
  FEATURE_FLAG_KEYS,
  getFlagDefinition,
  isKnownFeatureFlagKey,
  isKnownOrExternalFlagKey,
  specialtyTemplateFlagKey,
} from "./feature-flag-keys";
import { FLAG_ENFORCEMENT } from "./flag-enforcement";

const SRC = join(process.cwd(), "src");

function listTs(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) listTs(f, out);
    else if (n.endsWith(".ts") && !n.endsWith(".node.test.ts") && !n.endsWith(".integration.test.ts")) out.push(f);
  }
  return out;
}

describe("FF01 flag registry", () => {
  it("keeps the five pre-v2 keys", () => {
    for (const k of FEATURE_FLAG_KEYS) assert.ok(isKnownFeatureFlagKey(k), k);
  });

  it("every definition has AR + EN copy, class, scopes and unique key", () => {
    const seen = new Set<string>();
    for (const d of CLINIC_FLAG_DEFINITIONS) {
      assert.ok(!seen.has(d.key), `duplicate ${d.key}`);
      seen.add(d.key);
      assert.ok(d.descriptionEn && d.descriptionAr && d.whenOffEn && d.whenOffAr, d.key);
      assert.ok(/[؀-ۿ]/.test(d.descriptionAr) && /[؀-ۿ]/.test(d.whenOffAr), `${d.key} AR copy`);
      assert.ok(d.scopes.length > 0);
      assert.equal(d.launchLocked, d.class === "Launch-locked", d.key);
      assert.equal(d.launchLocked, d.gate != null, d.key);
    }
  });

  it("dependencies resolve to registered or external parent keys", () => {
    for (const d of CLINIC_FLAG_DEFINITIONS) {
      for (const p of d.dependsOn) assert.ok(isKnownOrExternalFlagKey(p), `${d.key} -> ${p}`);
    }
    assert.ok((EXTERNAL_PARENT_FLAG_KEYS as readonly string[]).includes("kiorex.marketplace"));
  });

  it("specialty template family accepts concrete codes only", () => {
    assert.ok(isKnownFeatureFlagKey(specialtyTemplateFlagKey("DERMATOLOGY")));
    assert.equal(getFlagDefinition("clinic.specialty_templates.dermatology")?.launchLocked, true);
    assert.equal(isKnownFeatureFlagKey("clinic.specialty_templates."), false);
    assert.equal(isKnownFeatureFlagKey("clinic.nope"), false);
  });

  it("matches kiorex-contracts flags/catalogue.json when the sibling repo is present", () => {
    const p = join(process.cwd(), "..", "..", "..", "kiorex-contracts", "flags", "catalogue.json");
    if (!existsSync(p)) return;
    const cat = JSON.parse(readFileSync(p, "utf8")) as {
      flags: { key: string; product: string; scopes: string[]; class: string; dependsOn: string[]; launchLocked: boolean }[];
    };
    // Kiorly Nurse is an edition of this codebase (ADR-031): its nurse.* keys (product "kiorly-nurse") live in the same registry.
    const mine = cat.flags.filter((f) => f.product === "kiorly-clinic" || f.product === "kiorly-nurse");
    assert.deepEqual(
      mine.map((f) => f.key).sort(),
      CLINIC_FLAG_DEFINITIONS.map((d) => d.key).sort(),
    );
    for (const f of mine) {
      const d = CLINIC_FLAG_DEFINITIONS.find((x) => x.key === f.key)!;
      assert.deepEqual([...d.scopes], f.scopes, f.key);
      assert.equal(d.class, f.class, f.key);
      assert.deepEqual([...d.dependsOn], f.dependsOn, f.key);
      assert.equal(d.launchLocked, f.launchLocked, f.key);
      assert.equal(d.product, f.product, f.key);
      assert.equal(d.edition ?? undefined, (f as { edition?: string }).edition, f.key);
      // Launch-locked gates are human evidence (GHV1/GHV2/GKN1/GKN2): the registry names them, code never records them.
      const gateIds = (f as { gateIds?: string[] }).gateIds ?? [];
      for (const g of gateIds) assert.ok(d.gate?.includes(g) ?? false, `${f.key} gate text names ${g}`);
    }
  });

  it("unknown flag key referenced in code fails CI", () => {
    const re = /(?:RequiresFeature|requireFeature|flagOn|isEnabled|isEnabledForUser)\s*\(\s*(?:[^,"')]*,\s*)?["']([a-z_.]+)["']/g;
    const bad: string[] = [];
    for (const f of listTs(SRC)) {
      if (f.includes("/feature-flags/")) continue;
      const s = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        if (!isKnownOrExternalFlagKey(m[1]!)) bad.push(`${f.replace(SRC, "")}: ${m[1]}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it("every registered flag has an enforcement site that exists and references the key", () => {
    for (const d of CLINIC_FLAG_DEFINITIONS) {
      const e = FLAG_ENFORCEMENT[d.key];
      assert.ok(e, `no enforcement entry for ${d.key}`);
      if (e.kind === "pending") continue;
      const base = d.keyPattern ? "clinic.specialty_templates" : d.key;
      const hit = e.files.some((rel) => {
        const s = readFileSync(join(SRC, rel), "utf8");
        return s.includes(base) || (d.keyPattern && s.includes("specialtyTemplateFlagKey"));
      });
      assert.ok(hit, `${d.key} not referenced in ${e.files.join(", ")}`);
    }
    assert.equal(CLINIC_FLAG_KEYS.length, CLINIC_FLAG_DEFINITIONS.length - 1);
  });

  it("Docs/FEATURE_FLAGS.md lists every key", () => {
    const doc = readFileSync(join(process.cwd(), "..", "..", "Docs", "FEATURE_FLAGS.md"), "utf8");
    for (const d of CLINIC_FLAG_DEFINITIONS) assert.ok(doc.includes(d.key), `FEATURE_FLAGS.md missing ${d.key}`);
  });
});
