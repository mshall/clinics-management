import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { describe, it } from "node:test";

const ROOT = join(__dirname, "../../../..");

describe("SC-06 acceptance", () => {
  it("WAF rule intent file exists with rate-based auth rule", () => {
    const path = join(ROOT, "platform/waf-rules.json");
    assert.equal(existsSync(path), true);
    const json = JSON.parse(readFileSync(path, "utf8")) as { rules: Array<{ id: string }> };
    assert.ok(json.rules.some((r) => r.id === "rate-public-auth"));
  });

  it("NH-017 tracks external pen-test before Gate 2", () => {
    const nh = readFileSync(join(ROOT, "Docs/KIORLY_NEEDS_HUMAN.md"), "utf8");
    assert.match(nh, /NH-017/);
    assert.match(nh, /penetration test/i);
  });

  it("SC-06 doc lists code gates", () => {
    const doc = readFileSync(join(ROOT, "Docs/SC06_RATE_LIMIT_WAF_SECRETS.md"), "utf8");
    assert.match(doc, /Rate limit/);
    assert.match(doc, /Secrets hygiene/);
    assert.match(doc, /NH-017/);
  });
});
