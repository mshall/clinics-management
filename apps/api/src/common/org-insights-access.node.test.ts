import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { test } from "node:test";

/** Keep in sync with apps/web/src/lib/org-insights-access.ts */
const WEB_ORG_INSIGHTS = new Set([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "hr_officer",
  "finance_officer",
]);

const API_INSIGHTS = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.HR_OFFICER,
  UserRole.FINANCE_OFFICER,
]);

test("web and API org insights roles stay aligned", () => {
  for (const slug of WEB_ORG_INSIGHTS) {
    const enumKey = slug.toUpperCase() as UserRole;
    assert.ok(API_INSIGHTS.has(enumKey), `API missing insights role for ${slug}`);
  }
  assert.equal(API_INSIGHTS.size, WEB_ORG_INSIGHTS.size);
});