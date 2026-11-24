import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leadSigningStatus, warnIfLeadSigningMissing } from "./lead-signing-status";

const SECRET = "a".repeat(64);
describe("lead signing status (KIOREX_LEAD_SIGNING_SECRET)", () => {
  it("is configured outside production (fixed dev value)", () => {
    assert.equal(leadSigningStatus({ NODE_ENV: "development" }).status, "configured");
    assert.equal(leadSigningStatus({}).status, "configured");
  });
  it("in production needs a real secret and never exposes it", () => {
    assert.equal(leadSigningStatus({ NODE_ENV: "production" }).status, "not configured");
    assert.equal(leadSigningStatus({ NODE_ENV: "production", KIOREX_LEAD_SIGNING_SECRET: "short" }).status, "not configured");
    const s = leadSigningStatus({ NODE_ENV: "production", KIOREX_LEAD_SIGNING_SECRET: SECRET });
    assert.equal(s.status, "configured");
    assert.ok(!JSON.stringify(s).includes(SECRET));
  });
  it("warns (names only) in production without a secret and stays quiet otherwise", () => {
    const lines: string[] = [];
    warnIfLeadSigningMissing((m) => lines.push(m), { NODE_ENV: "production", KIOREX_LEAD_SIGNING_SECRET: "tiny" });
    assert.equal(lines.length, 1);
    assert.ok(lines[0]!.includes("KIOREX_LEAD_SIGNING_SECRET") && !lines[0]!.includes("tiny"));
    warnIfLeadSigningMissing((m) => lines.push(m), { NODE_ENV: "production", KIOREX_LEAD_SIGNING_SECRET: SECRET });
    warnIfLeadSigningMissing((m) => lines.push(m), { NODE_ENV: "development" });
    assert.equal(lines.length, 1);
  });
});
