import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTemplateField, eddFromLmp, gestationalAgeFromLmp } from "./obstetric-dates";

describe("CL-04 OB dating (LMP → EDD / GA)", () => {
  it("EDD is LMP + 280 days", () => {
    assert.equal(eddFromLmp("2026-01-01"), "2026-10-08");
    assert.equal(eddFromLmp("2024-02-29"), "2024-12-05");
    assert.equal(eddFromLmp("not a date"), null);
  });

  it("gestational age in weeks and days", () => {
    assert.equal(gestationalAgeFromLmp("2026-01-01", new Date("2026-03-01T10:00:00Z")), "8w 3d");
    assert.equal(gestationalAgeFromLmp("2026-05-01", new Date("2026-03-01T10:00:00Z")), null);
  });

  it("computed template fields dispatch by kind", () => {
    assert.equal(computeTemplateField("EDD_FROM_LMP", "2026-01-01"), "2026-10-08");
    assert.equal(computeTemplateField("UNKNOWN", "2026-01-01"), null);
  });
});
