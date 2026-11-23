import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression (Passport sign-in found it): Nest installs its own global JSON parser only when no router layer is named "jsonParser".
 * Mounting body-parser's `json()` directly in main.ts (even path-scoped) disabled body parsing for every other route.
 */
describe("main.ts body parsers", () => {
  it("never mounts express json() directly with app.use", () => {
    const src = readFileSync(join(__dirname, "main.ts"), "utf8");
    assert.equal(/app\.use\([^)]*,\s*json\(/s.test(src), false, "wrap json() in a function so its layer is not named jsonParser");
    assert.equal(/app\.use\(\s*json\(/.test(src), false);
  });
});
