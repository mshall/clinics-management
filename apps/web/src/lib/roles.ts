export type DemoRole =
  | "platform_super_admin"
  | "group_admin"
  | "branch_manager"
  | "physician"
  | "nurse"
  | "receptionist"
  | "hr_officer"
  | "finance_officer"
  | "clinic_admin"
  | "clinic_assistant";

export function mapApiRole(role: string): DemoRole {
  const m: Record<string, DemoRole> = {
    PLATFORM_SUPER_ADMIN: "platform_super_admin",
    GROUP_ADMIN: "group_admin",
    BRANCH_MANAGER: "branch_manager",
    PHYSICIAN: "physician",
    NURSE: "nurse",
    RECEPTIONIST: "receptionist",
    HR_OFFICER: "hr_officer",
    FINANCE_OFFICER: "finance_officer",
    CLINIC_ADMIN: "clinic_admin",
    CLINIC_ASSISTANT: "clinic_assistant",
  };
  return m[role] ?? "physician";
}
