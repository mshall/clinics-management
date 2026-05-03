import type { UserRole } from "@prisma/client";

export interface JwtUser {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}
