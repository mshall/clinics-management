import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  PATIENT_PROFILE_INCOMPLETE,
  assertPatientProfileComplete,
} from "./patient-profile.guard";

describe("assertPatientProfileComplete", () => {
  it("allows complete profiles", async () => {
    const db = {
      patient: {
        findFirst: async () => ({ profileComplete: true }),
      },
    };
    await assertPatientProfileComplete(db as never, "t1", "p1");
  });

  it("blocks provisional profiles with stable code", async () => {
    const db = {
      patient: {
        findFirst: async () => ({ profileComplete: false }),
      },
    };
    await assert.rejects(
      () => assertPatientProfileComplete(db as never, "t1", "p1"),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, PATIENT_PROFILE_INCOMPLETE);
        return true;
      },
    );
  });
});
