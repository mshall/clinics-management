import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dialCodeFor, fixedMarketCode, shouldShowMarketSelector } from "./market-selector-policy";

describe("market selector rule: only when more than one market is live", () => {
  it("is hidden with none or one market", () => {
    assert.equal(shouldShowMarketSelector(undefined), false);
    assert.equal(shouldShowMarketSelector([]), false);
    assert.equal(shouldShowMarketSelector([{ code: "EG" }]), false);
  });
  it("is visible with two markets", () => {
    assert.equal(shouldShowMarketSelector([{ code: "EG" }, { code: "SA" }]), true);
  });
  it("fixes the value to Egypt (+20) with one market", () => {
    assert.equal(fixedMarketCode([{ code: "EG" }]), "EG");
    assert.equal(fixedMarketCode([]), "EG");
    assert.equal(dialCodeFor("eg"), "+20");
  });
});
