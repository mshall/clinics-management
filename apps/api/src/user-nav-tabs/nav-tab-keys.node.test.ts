import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { defaultNavTabsForRole } from "./nav-tab-keys";

describe("role default nav tabs", () => {
  it("finance officer gets billing/revenue/expenses/reports only: no Admin, Clinics, HR or clinical tabs", () => {
    assert.deepEqual(defaultNavTabsForRole(UserRole.FINANCE_OFFICER), ["expenses", "operations", "profile", "reports", "revenue"]);
  });
  it("branch manager keeps the full branch admin set", () => {
    const t = defaultNavTabsForRole(UserRole.BRANCH_MANAGER);
    for (const k of ["admin", "clinics", "revenue", "expenses", "patients"]) assert.ok(t.includes(k), k);
  });
});
