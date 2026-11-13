import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";

export const ASSISTANT_ENABLED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.PHYSICIAN,
]);

export type AssistantPersona = "organization_admin" | "physician";

export function assistantPersonaForRole(role: UserRole): AssistantPersona | null {
  if (role === UserRole.GROUP_ADMIN || role === UserRole.GROUP_SUPERVISOR) return "organization_admin";
  if (role === UserRole.PHYSICIAN) return "physician";
  return null;
}

export function assertAssistantAccess(user: JwtUser): AssistantPersona {
  const persona = assistantPersonaForRole(user.role);
  if (!persona) {
    throw new ForbiddenException("AI assistant is not available for this role");
  }
  if (!user.tenantId) {
    throw new ForbiddenException("AI assistant requires an organization context");
  }
  return persona;
}
