export type DemoRole =
  | "group_admin"
  | "branch_manager"
  | "physician"
  | "nurse"
  | "receptionist"
  | "hr_officer"
  | "finance_officer";

export function mapApiRole(role: string): DemoRole {
  const m: Record<string, DemoRole> = {
    GROUP_ADMIN: "group_admin",
    BRANCH_MANAGER: "branch_manager",
    PHYSICIAN: "physician",
    NURSE: "nurse",
    RECEPTIONIST: "receptionist",
    HR_OFFICER: "hr_officer",
    FINANCE_OFFICER: "finance_officer",
  };
  return m[role] ?? "physician";
}
