import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";

/** Principal carrying a primary role and optional extra roles (FD-01). */
export type RolePrincipal = Pick<JwtUser, "role" | "additionalRoles" | "isTenantOwner">;

export type UserRoleRow = {
  role: UserRole;
  additionalRoles?: UserRole[];
  isTenantOwner?: boolean;
};

const FORBIDDEN_ADDITIONAL = new Set<UserRole>([UserRole.PLATFORM_SUPER_ADMIN]);

/** Primary + additional roles, deduped (primary first). */
export function effectiveRoles(principal: RolePrincipal | UserRoleRow): UserRole[] {
  const extra = (principal as UserRoleRow).additionalRoles ?? (principal as JwtUser).additionalRoles ?? [];
  const out: UserRole[] = [principal.role];
  for (const r of extra) {
    if (r && r !== principal.role && !out.includes(r)) out.push(r);
  }
  return out;
}

export function hasRole(principal: RolePrincipal | UserRoleRow, role: UserRole): boolean {
  if (principal.role === role) return true;
  const extra = (principal as UserRoleRow).additionalRoles ?? (principal as JwtUser).additionalRoles ?? [];
  return extra.includes(role);
}

export function hasAnyRole(principal: RolePrincipal | UserRoleRow, roles: readonly UserRole[]): boolean {
  for (const r of roles) {
    if (hasRole(principal, r)) return true;
  }
  return false;
}

export function hasAnyRoleInSet(principal: RolePrincipal | UserRoleRow, allowed: ReadonlySet<UserRole>): boolean {
  return effectiveRoles(principal).some((r) => allowed.has(r));
}

export function isTenantOwnerPrincipal(principal: RolePrincipal | UserRoleRow): boolean {
  return Boolean((principal as UserRoleRow).isTenantOwner ?? (principal as JwtUser).isTenantOwner);
}

export function sanitizeAdditionalRoles(primary: UserRole, incoming: UserRole[]): UserRole[] {
  const uniq = new Set<UserRole>();
  for (const r of incoming) {
    if (r === primary) continue;
    if (FORBIDDEN_ADDITIONAL.has(r)) continue;
    uniq.add(r);
  }
  return [...uniq];
}

export function jwtUserFromRow(user: UserRoleRow & { id: string; tenantId: string | null; email: string }): JwtUser {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    additionalRoles: user.additionalRoles ?? [],
    isTenantOwner: Boolean(user.isTenantOwner),
  };
}