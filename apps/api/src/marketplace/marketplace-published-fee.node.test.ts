import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishedFee } from "./marketplace-provider-profile.service";

describe("KXM-PAY-01 published fees carry the visit-type deposit", () => {
  const t = { id: "t1", nameEn: "Consultation", nameAr: "كشف", feeAmount: "400", depositAmount: "150" };
  it("publishes depositAmount as a number", () => {
    assert.equal(publishedFee(t, undefined, "EGP").depositAmount, 150);
    assert.equal(publishedFee(t, undefined, "EGP").amount, 400);
  });
  it("profile fee override wins for the amount; no or zero deposit publishes null", () => {
    assert.equal(publishedFee({ ...t, depositAmount: null }, 450, "EGP").amount, 450);
    assert.equal(publishedFee({ ...t, depositAmount: null }, 450, "EGP").depositAmount, null);
    assert.equal(publishedFee({ ...t, depositAmount: "0" }, undefined, "EGP").depositAmount, null);
  });
});
