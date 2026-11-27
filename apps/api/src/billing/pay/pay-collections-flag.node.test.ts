import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Reflector } from "@nestjs/core";
import { REQUIRES_FEATURE_KEY } from "../../feature-flags/requires-feature.decorator";
import { CLINIC_FLAG_DEFINITIONS } from "../../feature-flags/feature-flag-keys";
import { PayCollectionsController, PayLinkPublicController } from "./pay-collections.controller";

describe("clinic.pay_collections flag", () => {
  it("is launch-locked (OFF everywhere until the gate is recorded) and guards every staff Pay route", () => {
    const def = CLINIC_FLAG_DEFINITIONS.find((d) => d.key === "clinic.pay_collections")!;
    assert.equal(def.launchLocked, true); assert.ok(def.gate && def.gate.length > 10);
    assert.equal(new Reflector().get(REQUIRES_FEATURE_KEY, PayCollectionsController), "clinic.pay_collections");
  });
  it("never gates the public payer page: links already issued keep working when the flag is off", () => {
    assert.equal(new Reflector().get(REQUIRES_FEATURE_KEY, PayLinkPublicController), undefined);
  });
});
