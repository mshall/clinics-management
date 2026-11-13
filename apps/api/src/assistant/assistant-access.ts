import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";

export const ASSISTANT_ROLE_SLUGS = [
  "platform_super_admin",
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "finance_officer",
  "hr_officer",
  "clinic_admin",
  "clinic_assistant",
  "physician",
  "nurse",
  "receptionist",
  "call_center",
] as const;

export type AssistantRoleSlug = (typeof ASSISTANT_ROLE_SLUGS)[number];

const SLUG_BY_ROLE: Record<UserRole, AssistantRoleSlug> = {
  [UserRole.PLATFORM_SUPER_ADMIN]: "platform_super_admin",
  [UserRole.GROUP_ADMIN]: "group_admin",
  [UserRole.GROUP_SUPERVISOR]: "group_supervisor",
  [UserRole.BRANCH_MANAGER]: "branch_manager",
  [UserRole.FINANCE_OFFICER]: "finance_officer",
  [UserRole.HR_OFFICER]: "hr_officer",
  [UserRole.CLINIC_ADMIN]: "clinic_admin",
  [UserRole.CLINIC_ASSISTANT]: "clinic_assistant",
  [UserRole.PHYSICIAN]: "physician",
  [UserRole.NURSE]: "nurse",
  [UserRole.RECEPTIONIST]: "receptionist",
  [UserRole.CALL_CENTER]: "call_center",
};

export function assistantRoleSlugForRole(role: UserRole): AssistantRoleSlug {
  return SLUG_BY_ROLE[role] ?? "receptionist";
}

export function assertAssistantAccess(user: JwtUser): AssistantRoleSlug {
  const slug = assistantRoleSlugForRole(user.role);
  if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
    return slug;
  }
  if (!user.tenantId) {
    throw new ForbiddenException("AI assistant requires an organization context");
  }
  return slug;
}

// Backward-compatible alias
export const assistantPersonaForRole = assistantRoleSlugForRole;
