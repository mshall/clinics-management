import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gender, PatientAcquisitionChannel } from "@prisma/client";
import {
  patientMergeFillEmptyChoices,
  patientMergeRichnessScore,
  patientMergeTargetUpdateData,
  type PatientMergeSnapshot,
} from "./patient-merge-fields";

function snap(partial: Partial<PatientMergeSnapshot> = {}): PatientMergeSnapshot {
  return {
    firstNameEn: "Ada",
    lastNameEn: "Lovelace",
    firstNameAr: null,
    lastNameAr: null,
    phone: "+201000000001",
    email: null,
    nationalId: null,
    dob: null,
    gender: Gender.F,
    homeBranchId: null,
    acquisitionChannel: null,
    acquisitionReferralName: null,
    acquisitionOtherDetail: null,
    isVip: false,
    needsChaperone: false,
    ...partial,
  };
}

describe("patientMergeFillEmptyChoices", () => {
  it("copies missing demographics from source onto target", () => {
    const choices = patientMergeFillEmptyChoices(
      snap({ email: null, nationalId: null, firstNameAr: null }),
      snap({
        email: "a@example.com",
        nationalId: "123",
        firstNameAr: "آدا",
        acquisitionChannel: PatientAcquisitionChannel.WEBSITE_GOOGLE,
      }),
    );
    assert.equal(choices.email, "source");
    assert.equal(choices.nationalId, "source");
    assert.equal(choices.firstNameAr, "source");
    assert.equal(choices.acquisitionChannel, "source");
    assert.equal(choices.firstNameEn, undefined);
  });
});

describe("patientMergeTargetUpdateData", () => {
  it("defaults to fill-empty when choices omitted", () => {
    const data = patientMergeTargetUpdateData(
      snap({ email: null }),
      snap({ email: "b@example.com" }),
      undefined,
    );
    assert.equal(data.email, "b@example.com");
  });
});

describe("patientMergeRichnessScore", () => {
  it("scores related documents higher than empty demographics", () => {
    const sparse = patientMergeRichnessScore(snap());
    const rich = patientMergeRichnessScore(snap({ nationalId: "1", dob: new Date("1990-01-01") }), {
      documents: 3,
      encounters: 1,
    });
    assert.ok(rich > sparse);
  });
});
