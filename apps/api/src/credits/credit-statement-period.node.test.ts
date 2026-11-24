import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { CreditStatementService } from "./credit-statement.service";

/** W8 integration finding: GET /credits/statement/<malformed period> answered 500. A malformed period is the caller's mistake: 400 INVALID_PERIOD, before any database read. */
describe("credit statement period validation", () => {
  const prismaThatMustNotBeRead = new Proxy({}, { get: () => { throw new Error("the database must not be read for a malformed period"); } });
  const svc = new CreditStatementService(prismaThatMustNotBeRead as never);
  for (const bad of ["abc", "2026-13", "2026-00", "2026-1", "26-01", "2026-01-01", "", " ", "2026/01", "%00", "'; DROP TABLE x;--", "9999999-01"]) {
    it(`rejects ${JSON.stringify(bad)} with 400 INVALID_PERIOD`, async () => {
      await assert.rejects(() => svc.sectionForPeriod("t1", bad), (e: unknown) => e instanceof BadRequestException && (e.getResponse() as { code?: string }).code === "INVALID_PERIOD");
    });
  }
});
