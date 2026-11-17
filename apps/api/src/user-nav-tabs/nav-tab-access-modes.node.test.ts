import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTabAccessModes, sanitizeTabAccessModes, tabAccessModeForTab } from "./nav-tab-access-modes";

describe("nav tab access modes", () => {
  it("parses read and write keys only", () => {
    const parsed = parseTabAccessModes({ operations: "read", expenses: "WRITE", bogus: "x" });
    assert.equal(parsed.operations, "read");
    assert.equal(parsed.expenses, "write");
    assert.equal(parsed.bogus, undefined);
  });

  it("sanitize drops profile and defaults to write", () => {
    const modes = sanitizeTabAccessModes(["operations", "profile"], { operations: "read" });
    assert.ok(modes);
    assert.equal(modes!.operations, "read");
    assert.equal(modes!.profile, undefined);
  });

  it("returns null when every tab is write", () => {
    assert.equal(sanitizeTabAccessModes(["operations"], { operations: "write" }), null);
  });

  it("tabAccessModeForTab defaults to write", () => {
    assert.equal(tabAccessModeForTab(null, "operations"), "write");
    assert.equal(tabAccessModeForTab({ operations: "read" }, "operations"), "read");
  });
});