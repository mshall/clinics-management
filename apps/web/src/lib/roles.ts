export type DemoRole =
  | "platform_super_admin"
  | "group_admin"
  | "group_supervisor"
  | "branch_manager"
  | "physician"
  | "nurse"
  | "receptionist"
  | "call_center"
  | "hr_officer"
  | "finance_officer"
  | "clinic_admin"
  | "clinic_assistant";

export function mapApiRole(role: string): DemoRole {
  const trimmed = role.trim();
  const key = trimmed.toUpperCase();
  const m: Record<string, DemoRole> = {
    PLATFORM_SUPER_ADMIN: "platform_super_admin",
    GROUP_ADMIN: "group_admin",
    GROUP_SUPERVISOR: "group_supervisor",
    BRANCH_MANAGER: "branch_manager",
    PHYSICIAN: "physician",
    NURSE: "nurse",
    RECEPTIONIST: "receptionist",
    CALL_CENTER: "call_center",
    HR_OFFICER: "hr_officer",
    FINANCE_OFFICER: "finance_officer",
    CLINIC_ADMIN: "clinic_admin",
    CLINIC_ASSISTANT: "clinic_assistant",
  };
  if (m[key]) return m[key];
  const slugs = new Set(Object.values(m));
  if (slugs.has(trimmed as DemoRole)) return trimmed as DemoRole;
  return "physician";
}
