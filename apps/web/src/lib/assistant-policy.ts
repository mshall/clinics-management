import type { DemoRole } from "@/lib/roles";

/** Roles that see the floating AI assistant (organization admin tier + physicians). */
export function isAssistantEnabledForRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return role === "group_admin" || role === "group_supervisor" || role === "physician";
}

export type AssistantPersona = "organization_admin" | "physician";

export function assistantPersonaForRole(role: DemoRole | string): AssistantPersona | null {
  if (role === "group_admin" || role === "group_supervisor") return "organization_admin";
  if (role === "physician") return "physician";
  return null;
}
