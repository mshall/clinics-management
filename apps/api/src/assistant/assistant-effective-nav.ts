import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import {
  EmployeePrivilegeGrantSummary,
  loadEmployeePrivilegeGrantSummaries,
} from "../common/employee-privilege-grants";
import type { PrismaService } from "../prisma/prisma.service";
import type { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import {
  defaultNavTabsForRole,
  effectiveRoleNavTabs,
  maxNavTabsForOrganization,
  parseStoredNavTabKeys,
  sanitizeNavTabKeysForRole,
} from "../user-nav-tabs/nav-tab-keys";

export function hasHrNavAccessFromGrants(grants: EmployeePrivilegeGrantSummary[]): boolean {
  return grants.some((g) => g.canManageEmployees || g.hrProvisionLogin);
}

/** Mirrors web `effectiveNavKeys` for assistant permission boundaries. */
export async function resolveAssistantNavKeys(
  prisma: PrismaService,
  tenantRoleNav: TenantRoleNavTabsService,
  user: JwtUser,
): Promise<string[]> {
  if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
    return defaultNavTabsForRole(user.role);
  }
  const tenantId = user.tenantId;
  if (!tenantId) return defaultNavTabsForRole(user.role);

  const [userGrant, roleGrantRaw, hrGrants] = await Promise.all([
    prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.userId } },
    }),
    tenantRoleNav.roleNavTabKeysForTenantUser(tenantId, user.role),
    loadEmployeePrivilegeGrantSummaries(prisma, tenantId, user.userId),
  ]);

  const roleBase = effectiveRoleNavTabs(user.role, roleGrantRaw);
  const parsedUser = userGrant ? parseStoredNavTabKeys(userGrant.tabKeys) : null;

  let keys: string[];
  if (parsedUser?.length) {
    const org = maxNavTabsForOrganization();
    const uniq = new Set<string>();
    for (const k of parsedUser) {
      if (org.has(k)) uniq.add(k);
    }
    uniq.add("profile");
    keys = [...uniq];
  } else {
    keys = sanitizeNavTabKeysForRole(user.role, roleBase, roleBase);
  }

  if (hasHrNavAccessFromGrants(hrGrants)) {
    const withHr = new Set(keys);
    withHr.add("hr");
    keys = [...withHr];
  }

  return keys.sort((a, b) => a.localeCompare(b));
}
