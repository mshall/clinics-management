import { FinancialVisibilityOverride, UserRole } from "@prisma/client";
import { moneyVisibilityFromOverride } from "../common/money-access-override";
import { hasAnyRole, isTenantOwnerPrincipal, type RolePrincipal } from "../common/effective-roles";

/**
 * COM-1 who may see the Kiorex commission money views of an organisation (charges, collections, deductions, statements, exports).
 *   finance        FINANCE_OFFICER: always (role default)
 *   owner / group  the tenant owner and GROUP_ADMIN: always (they are the contract holder; an override can never lock the owner out)
 *   admins         CLINIC_ADMIN and BRANCH_MANAGER: only when the organisation (or its market) enabled `kiorexCommissions.adminView`
 *   everyone else  never (front desk, clinicians, nurses, call center, HR)
 * The per-user money override ("operations") can show it to one more person or hide it from one finance/admin user, exactly like the other money screens.
 * Pure function: the controller, the web capability endpoint and the tests use this one table.
 */
export const COMMISSION_ALWAYS_ROLES: readonly UserRole[] = [UserRole.FINANCE_OFFICER, UserRole.GROUP_ADMIN];
export const COMMISSION_CONFIG_ROLES: readonly UserRole[] = [UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER];

export function canViewKiorexCommissions(principal: RolePrincipal, o: { override?: FinancialVisibilityOverride; adminView: boolean }): boolean {
  const owner = isTenantOwnerPrincipal(principal);
  const roleDefault = owner || hasAnyRole(principal, COMMISSION_ALWAYS_ROLES) || (o.adminView && hasAnyRole(principal, COMMISSION_CONFIG_ROLES));
  if (owner) return true;
  return moneyVisibilityFromOverride(o.override ?? FinancialVisibilityOverride.ROLE_DEFAULT, roleDefault);
}

/** `kiorexCommissions.adminView` from the organisation's provider settings, else the market pack (`providerConfig.billing.kiorexCommissionsAdminView`), else false (finance only). */
export function adminViewEnabled(tenantSettings: unknown, marketProviderConfig: unknown): boolean {
  const t = (tenantSettings as { kiorexCommissions?: { adminView?: unknown } } | null)?.kiorexCommissions?.adminView;
  if (typeof t === "boolean") return t;
  const m = (marketProviderConfig as { billing?: { kiorexCommissionsAdminView?: unknown } } | null)?.billing?.kiorexCommissionsAdminView;
  return m === true;
}
