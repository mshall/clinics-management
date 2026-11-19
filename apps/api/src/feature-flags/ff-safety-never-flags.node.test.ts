import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CLINIC_FLAG_DEFINITIONS } from "./feature-flag-keys";
import { FLAG_GATING_PATTERNS, flagKeyViolatesSafetyRule, SAFETY_CONTROLS } from "./safety-controls";

const SRC = join(process.cwd(), "src");

describe("ADR-025 safety controls are never flags", () => {
  it("no registered flag key names a safety control", () => {
    for (const d of CLINIC_FLAG_DEFINITIONS) assert.equal(flagKeyViolatesSafetyRule(d.key), null, d.key);
    assert.ok(flagKeyViolatesSafetyRule("clinic.privileged_mfa_bypass"));
    assert.ok(flagKeyViolatesSafetyRule("clinic.rx_safety_checks"));
  });

  for (const c of SAFETY_CONTROLS) {
    it(`${c.id}: safety code is not flag-guarded`, () => {
      for (const rel of c.paths) {
        const f = join(SRC, rel);
        assert.ok(existsSync(f), `safety path missing: ${rel}`);
        const s = readFileSync(f, "utf8");
        for (const re of FLAG_GATING_PATTERNS) {
          assert.ok(!re.test(s), `${rel} must not use feature-flag gating (${re}) — ADR-025`);
        }
      }
    });
  }

  it("detector catches a guard placed on a safety path", () => {
    const sample = `@UseGuards(FeatureGuard)\n@RequiresFeature("x")\nclass RxSafety {}`;
    assert.ok(FLAG_GATING_PATTERNS.some((re) => re.test(sample)));
  });
});
