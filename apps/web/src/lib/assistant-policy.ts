import type { DemoRole } from "@/lib/roles";

/** Every authenticated tenant/platform role gets a permission-scoped assistant. */
export function isAssistantEnabledForRole(role: string | undefined | null): boolean {
  return Boolean(role?.trim());
}

export type AssistantRoleSlug = DemoRole;

export function assistantPersonaForRole(role: DemoRole | string): DemoRole | null {
  if (!role?.trim()) return null;
  return role as DemoRole;
}
