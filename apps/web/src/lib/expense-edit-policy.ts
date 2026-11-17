import type { ExpenseDto } from "@/lib/api-types";
import { canMutateExpenses, type NavTabAccessMode } from "@/lib/nav-tab-access-policy";
import { mapApiRole, type DemoRole } from "@/lib/roles";

export function canEditExpenses(
  role: string | DemoRole | undefined | null,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  if (!role) return false;
  return canMutateExpenses(mapApiRole(String(role)), navTabKeys, navTabAccessModes);
}

export function canEditPendingExpense(
  expense: Pick<ExpenseDto, "status">,
  role: string | DemoRole | undefined | null,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return expense.status === "PENDING" && canEditExpenses(role, navTabKeys, navTabAccessModes);
}
