import { HttpException } from "@nestjs/common";

/** KX-09 §03 — 422 OUT_OF_COVERAGE: the address district is outside the clinician's coverage (also after a zone change post-hold). */
export class OutOfCoverageException extends HttpException {
  constructor(district: string | null, reason: string, alternatives: unknown[] = []) {
    super({ statusCode: 422, code: "OUT_OF_COVERAGE", message: "District is not covered", district, reason, alternatives }, 422);
  }
}

/** Typed 422/409 business errors for home visits. */
export class HomeVisitRuleException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status = 422,
  ) {
    super({ statusCode: status, code, message }, status);
  }
}
