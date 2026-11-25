import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FinancialVisibilityOverride, UserRole } from "@prisma/client";
import { adminViewEnabled, canViewKiorexCommissions } from "./kiorex-commission-access";

const p = (role: UserRole, extra: Partial<{ additionalRoles: UserRole[]; isTenantOwner: boolean }> = {}) => ({ userId: "u", tenantId: "t", email: "e", role, ...extra });

describe("COM-1 who sees Kiorex commission money views (Clinic)", () => {
  it("finance and the owner always; administrators only when enabled; everyone else never", () => {
    assert.equal(canViewKiorexCommissions(p(UserRole.FINANCE_OFFICER), { adminView: false }), true);
    assert.equal(canViewKiorexCommissions(p(UserRole.GROUP_ADMIN), { adminView: false }), true);
    assert.equal(canViewKiorexCommissions(p(UserRole.CLINIC_ADMIN, { isTenantOwner: true }), { adminView: false }), true);
    assert.equal(canViewKiorexCommissions(p(UserRole.CLINIC_ADMIN), { adminView: false }), false);
    assert.equal(canViewKiorexCommissions(p(UserRole.CLINIC_ADMIN), { adminView: true }), true);
    assert.equal(canViewKiorexCommissions(p(UserRole.BRANCH_MANAGER), { adminView: true }), true);
    for (const r of [UserRole.RECEPTIONIST, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.CALL_CENTER, UserRole.HR_OFFICER, UserRole.CLINIC_ASSISTANT]) assert.equal(canViewKiorexCommissions(p(r), { adminView: true }), false, r);
  });
  it("an additional finance role counts", () => {
    assert.equal(canViewKiorexCommissions(p(UserRole.RECEPTIONIST, { additionalRoles: [UserRole.FINANCE_OFFICER] }), { adminView: false }), true);
  });
  it("the per-user money override can show it to one person or hide it from one finance user, never from the owner", () => {
    assert.equal(canViewKiorexCommissions(p(UserRole.RECEPTIONIST), { adminView: false, override: FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY }), true);
    assert.equal(canViewKiorexCommissions(p(UserRole.FINANCE_OFFICER), { adminView: false, override: FinancialVisibilityOverride.HIDE_VISIBILITY_ONLY }), false);
    assert.equal(canViewKiorexCommissions(p(UserRole.CLINIC_ADMIN, { isTenantOwner: true }), { adminView: false, override: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT }), true);
  });
  it("organisation setting beats the market pack; default is finance only", () => {
    assert.equal(adminViewEnabled(null, null), false);
    assert.equal(adminViewEnabled({}, { billing: { kiorexCommissionsAdminView: true } }), true);
    assert.equal(adminViewEnabled({ kiorexCommissions: { adminView: false } }, { billing: { kiorexCommissionsAdminView: true } }), false);
  });
});
