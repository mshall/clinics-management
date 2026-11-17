import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { PlanKey } from "@prisma/client";
import {
  LEGAL_CATALOG,
  legalAcceptancesPayload,
  requiredLegalForSignup,
  SIGNUP_BASE_LEGAL,
  SIGNUP_PAID_LEGAL,
} from "./legal-catalog";
import { LegalAcceptanceService } from "./legal-acceptance.service";

describe("GT-02 legal catalog", () => {
  it("requires base pack for LITE signup", () => {
    assert.deepEqual(requiredLegalForSignup(PlanKey.LITE), SIGNUP_BASE_LEGAL);
  });

  it("requires paid pack for PRO signup", () => {
    assert.deepEqual(requiredLegalForSignup(PlanKey.PRO), SIGNUP_PAID_LEGAL);
  });

  it("validateAcceptancePayload rejects missing documents", () => {
    const svc = new LegalAcceptanceService({} as never, {} as never);
    assert.throws(
      () => svc.assertSignupLegal(PlanKey.LITE, legalAcceptancesPayload(["terms_of_service"])),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });

  it("validateAcceptancePayload rejects wrong version", () => {
    const svc = new LegalAcceptanceService({} as never, {} as never);
    const items = legalAcceptancesPayload(requiredLegalForSignup(PlanKey.LITE));
    items[0] = { ...items[0], version: "old" };
    assert.throws(() => svc.assertSignupLegal(PlanKey.LITE, items));
  });

  it("accepts current LITE pack", () => {
    const svc = new LegalAcceptanceService({} as never, {} as never);
    assert.doesNotThrow(() =>
      svc.assertSignupLegal(PlanKey.LITE, legalAcceptancesPayload(requiredLegalForSignup(PlanKey.LITE))),
    );
    assert.equal(LEGAL_CATALOG.terms_of_service.version.length, 10);
  });
});