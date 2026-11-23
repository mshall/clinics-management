import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOrgClinicalSpecialty } from "./org-identity";

describe("resolveOrgClinicalSpecialty", () => {
  it("returns null when no clinics", () => {
    assert.equal(resolveOrgClinicalSpecialty([]), null);
  });

  it("returns the single specialty when unanimous", () => {
    assert.equal(resolveOrgClinicalSpecialty(["DENTISTRY", "DENTISTRY"]), "DENTISTRY");
  });

  it("returns POLYCLINIC when clinics disagree", () => {
    assert.equal(resolveOrgClinicalSpecialty(["DENTISTRY", "DERMATOLOGY"]), "POLYCLINIC");
  });
});
