import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FinancialVisibilityOverride, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { DEFAULT_MONEY_VISIBILITY_OVERRIDES } from "../common/user-money-visibility";
import {
  buildReportPdf,
  buildSpreadsheetMl,
  isReportExportKey,
  MONEY_REPORT_KEYS,
} from "./report-export-format";
import { moneyExportBlockedByHideOverride, ReportsExportService } from "./reports-export.service";

describe("RP-02 report export format & money visibility", () => {
  it("builds SpreadsheetML xlsx and PDF with expected magic / headers", () => {
    const rows = [
      { date: "2026-11-01", patient: "Ada", amount: 100, method: "CASH", reference: "r1" },
      { date: "2026-11-02", patient: "Bob", amount: 50.5, method: "CARD", reference: "" },
    ];
    const xls = buildSpreadsheetMl("payments", rows);
    const xml = xls.toString("utf8");
    assert.ok(xml.includes("Excel.Sheet"));
    assert.ok(xml.includes("Ada"));
    assert.ok(xml.includes("ss:Type=\"Number\""));

    const pdf = buildReportPdf("payments", rows);
    assert.ok(pdf.subarray(0, 5).toString("utf8").startsWith("%PDF"));
    assert.ok(pdf.length > 100);
  });

  it("accepts known export keys including payments", () => {
    assert.equal(isReportExportKey("payments"), true);
    assert.equal(isReportExportKey("operations"), true);
    assert.equal(isReportExportKey("unknown"), false);
    assert.ok(MONEY_REPORT_KEYS.has("payments"));
  });

  it("exports respect money visibility overrides (HIDE blocks finance export)", () => {
    assert.equal(moneyExportBlockedByHideOverride(), true);

    const owner = {
      userId: "u1",
      tenantId: "t1",
      email: "o@x.com",
      role: UserRole.GROUP_ADMIN,
      roles: [UserRole.GROUP_ADMIN],
    } as JwtUser;
    assert.equal(
      ReportsExportService.moneyVisibleForOverrides(owner, DEFAULT_MONEY_VISIBILITY_OVERRIDES),
      true,
    );
    assert.equal(
      ReportsExportService.moneyVisibleForOverrides(owner, {
        ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
        operations: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT,
      }),
      false,
    );

    const receptionist = {
      userId: "u2",
      tenantId: "t1",
      email: "r@x.com",
      role: UserRole.RECEPTIONIST,
      roles: [UserRole.RECEPTIONIST],
    } as JwtUser;
    assert.equal(
      ReportsExportService.moneyVisibleForOverrides(receptionist, DEFAULT_MONEY_VISIBILITY_OVERRIDES),
      false,
    );
  });
});
