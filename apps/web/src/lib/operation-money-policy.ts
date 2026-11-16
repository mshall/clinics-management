import type { DemoRole } from "@/lib/roles";

export function canViewOperationMoney(role: DemoRole | undefined): boolean {
  return role !== "call_center";
}

export function canCreateOperation(role: DemoRole | undefined): boolean {
  if (!role) return false;
  const allowed = new Set<DemoRole>([
    "group_admin",
    "group_supervisor",
    "branch_manager",
    "clinic_admin",
    "clinic_assistant",
    "receptionist",
    "call_center",
  ]);
  return allowed.has(role);
}