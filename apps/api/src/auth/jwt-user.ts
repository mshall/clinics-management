import type { UserRole } from "@prisma/client";

export interface JwtUser {
  userId: string;
  /** Null for platform super administrators (no organization membership). */
  tenantId: string | null;
  email: string;
  /** Primary role (legacy field; use effectiveRoles() for authorization). */
  role: UserRole;
  /** Extra roles beyond primary (FD-01); default empty when omitted in tests/legacy payloads). */
  additionalRoles?: UserRole[];
  isTenantOwner?: boolean;
}
