import { ForbiddenException } from "@nestjs/common";
import type { JwtUser } from "./jwt-user";

/** Tenant-scoped APIs reject platform super administrators (no organization). */
export function requireTenantId(user: Pick<JwtUser, "tenantId">): string {
  if (user.tenantId == null) {
    throw new ForbiddenException("This action requires organization membership");
  }
  return user.tenantId;
}
