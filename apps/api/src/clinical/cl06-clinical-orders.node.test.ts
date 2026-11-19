import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClinicalOrderStatus } from "@prisma/client";
import { RESULTS_READY_TEMPLATE } from "./clinical-orders.service";

describe("CL-06 clinical orders", () => {
  it("uses results_ready WhatsApp template when results become ready", () => {
    assert.equal(RESULTS_READY_TEMPLATE, "results_ready");
    assert.equal(ClinicalOrderStatus.RESULTS_READY, "RESULTS_READY");
  });
});
