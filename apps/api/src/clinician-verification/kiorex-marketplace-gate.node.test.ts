import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VerificationStatus, UserRole } from "@prisma/client";
import { tenantHasVerifiedPhysician } from "./kiorex-marketplace-gate";

describe("KX-01 Kiorex marketplace gate", () => {
  it("requires at least one verified physician", () => {
    assert.equal(
      tenantHasVerifiedPhysician([
        {
          status: VerificationStatus.UNVERIFIED,
          user: { role: UserRole.PHYSICIAN, additionalRoles: [] },
        },
      ]),
      false,
    );
    assert.equal(
      tenantHasVerifiedPhysician([
        {
          status: VerificationStatus.VERIFIED,
          user: { role: UserRole.PHYSICIAN, additionalRoles: [] },
        },
      ]),
      true,
    );
    assert.equal(
      tenantHasVerifiedPhysician([
        {
          status: VerificationStatus.VERIFIED,
          user: { role: UserRole.RECEPTIONIST, additionalRoles: [UserRole.PHYSICIAN] },
        },
      ]),
      true,
    );
  });
});