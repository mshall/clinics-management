import type { DemoRole } from "@/lib/roles";

const DESK_ROLES = new Set<DemoRole>([
  "group_admin",
  "clinic_admin",
  "finance_officer",
  "branch_manager",
  "receptionist",
  "clinic_assistant",
]);

type MoneyUser = {
  role: DemoRole;
  additionalRoles?: DemoRole[];
  isTenantOwner?: boolean;
  entitlements?: Record<string, unknown> | null;
} | null | undefined;

/** MN-01 — mirrors the API: Pro+ (`mod_invoices`) and a desk/finance role or the owner. */
export function canUsePatientMoney(user: MoneyUser): boolean {
  if (!user) return false;
  if (user.entitlements && user.entitlements.mod_invoices === false) return false;
  if (user.isTenantOwner) return true;
  return [user.role, ...(user.additionalRoles ?? [])].some((r) => DESK_ROLES.has(r));
}
