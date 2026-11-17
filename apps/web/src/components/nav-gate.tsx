import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import {
  defaultHomeForRole,
  navTabBlockReason,
  showNavItem,
  upgradePlanLabelForNavTab,
  type NavItemKey,
} from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { UpgradeHint } from "@/components/upgrade-hint";
import { NAV_TAB_ENTITLEMENT } from "@/lib/plan-nav-entitlements";

export function NavGate({ tab, children }: { tab: NavItemKey; children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const employeePrivilegeGrants = useAuthStore((s) => s.user?.employeePrivilegeGrants);
  const planEntitlements = useAuthStore((s) => s.user?.entitlements);
  const planKey = useAuthStore((s) => s.user?.plan?.key ?? null);

  if (
    showNavItem(role, tab, navTabKeys, roleNavTabKeys, employeePrivilegeGrants, undefined, planEntitlements, planKey)
  ) {
    return <>{children}</>;
  }

  const reason = navTabBlockReason(
    tab,
    role,
    navTabKeys,
    roleNavTabKeys,
    employeePrivilegeGrants,
    undefined,
    planEntitlements,
    planKey,
  );

  if (reason === "plan" || reason === "entitlement") {
    const requiredPlan = upgradePlanLabelForNavTab(tab) ?? "PRO";
    const entitlement = NAV_TAB_ENTITLEMENT[tab] ?? tab;
    return (
      <div className="mx-auto max-w-lg p-6">
        <UpgradeHint entitlement={entitlement} requiredPlan={requiredPlan} />
      </div>
    );
  }

  return (
    <Navigate
      to={defaultHomeForRole(role, navTabKeys, roleNavTabKeys, employeePrivilegeGrants)}
      replace
    />
  );
}