import type { UserRole } from "@prisma/client";

export interface JwtUser {
  userId: string;
  /** Null for platform super administrators (no organization membership). */
  tenantId: string | null;
  email: string;
  role: UserRole;
}
