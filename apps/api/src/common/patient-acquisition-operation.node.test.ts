import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PatientAcquisitionChannel } from "@prisma/client";
import { assertOperationAcquisition } from "./patient-acquisition";

describe("assertOperationAcquisition", () => {
  it("allows missing channel when not required", () => {
    assert.doesNotThrow(() => assertOperationAcquisition({}, false));
  });

  it("requires channel when tenant setting is mandatory", () => {
    assert.throws(
      () => assertOperationAcquisition({}, true),
      (e: { message?: string }) => /found the clinic/i.test(String(e?.message ?? e)),
    );
  });

  it("still validates referral detail when channel is set and optional", () => {
    assert.throws(
      () =>
        assertOperationAcquisition(
          { acquisitionChannel: PatientAcquisitionChannel.DOCTOR_REFERRAL },
          false,
        ),
      (e: { message?: string }) => /referring doctor/i.test(String(e?.message ?? e)),
    );
  });
});
