import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gender } from "@prisma/client";
import { normalizeMarketplaceGender } from "./marketplace-patient-intake.service";

describe("KX-09 marketplace patient gender mapping", () => {
  it("maps Kiorex MALE/FEMALE and Kiorly M/F, and never passes an unknown value through", () => {
    assert.equal(normalizeMarketplaceGender("FEMALE"), Gender.F);
    assert.equal(normalizeMarketplaceGender("male"), Gender.M);
    assert.equal(normalizeMarketplaceGender("M"), Gender.M);
    assert.equal(normalizeMarketplaceGender("OTHER"), Gender.OTHER);
    assert.equal(normalizeMarketplaceGender("UNSPECIFIED"), Gender.UNKNOWN);
    assert.equal(normalizeMarketplaceGender(undefined), Gender.UNKNOWN);
    assert.equal(normalizeMarketplaceGender("???"), Gender.UNKNOWN);
  });
});
