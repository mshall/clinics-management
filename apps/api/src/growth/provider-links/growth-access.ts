import { UserRole } from "@prisma/client";
import { hasAnyRoleInSet } from "../../common/effective-roles";
import type { JwtUser } from "../../auth/jwt-user";

/**
 * Growth & Marketing permissions (GRW-P1-D1, PROPOSED_DEFAULT; the role matrix is a founder decision, see Docs/GROWTH.md).
 *  - owner / admin  (GROUP_ADMIN, CLINIC_ADMIN, BRANCH_MANAGER, tenant owner): everything, including widget origins and revoking links.
 *  - marketing      (CLINIC_ASSISTANT, the closest existing role; there is no dedicated Marketing role yet): create, pause and resume links, QR and
 *                   posters, performance. NOT widget origins (they control which sites may embed booking) and NOT revoke.
 *  - read           (GROUP_SUPERVISOR, RECEPTIONIST): view links, QR and posters of their organisation; the reception desk prints its own card.
 */
const MANAGE = new Set<UserRole>([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);
const MARKETING = new Set<UserRole>([UserRole.CLINIC_ASSISTANT]);
const READ = new Set<UserRole>([UserRole.GROUP_SUPERVISOR, UserRole.RECEPTIONIST]);

export type GrowthLevel = "admin" | "marketing" | "read" | "none";

export function growthLevel(user: Pick<JwtUser, "role" | "additionalRoles" | "isTenantOwner">): GrowthLevel {
  if (user.isTenantOwner || hasAnyRoleInSet(user, MANAGE)) return "admin";
  if (hasAnyRoleInSet(user, MARKETING)) return "marketing";
  if (hasAnyRoleInSet(user, READ)) return "read";
  return "none";
}

export type GrowthAction = "view" | "create" | "update" | "revoke" | "widget";
const MATRIX: Record<GrowthLevel, ReadonlySet<GrowthAction>> = {
  admin: new Set(["view", "create", "update", "revoke", "widget"]),
  marketing: new Set(["view", "create", "update"]),
  read: new Set(["view"]),
  none: new Set(),
};
export function canGrowth(user: Pick<JwtUser, "role" | "additionalRoles" | "isTenantOwner">, action: GrowthAction): boolean {
  return MATRIX[growthLevel(user)].has(action);
}
