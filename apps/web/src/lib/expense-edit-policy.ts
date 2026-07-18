import { mapApiRole, type DemoRole } from "@/lib/roles";
import type { ExpenseDto } from "@/lib/api-types";

/** Matches `EXPENSE_ROLES` in `apps/api/src/expenses/expenses.controller.ts`. */
const EXPENSE_EDIT_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "branch_manager",
  "finance_officer",
  "hr_officer",
  "clinic_assistant",
]);

export function canEditExpenses(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const mapped = mapApiRole(String(role));
  return EXPENSE_EDIT_ROLES.has(mapped);
}

export function canEditPendingExpense(
  expense: Pick<ExpenseDto, "status">,
  role: string | DemoRole | undefined | null,
): boolean {
  return expense.status === "PENDING" && canEditExpenses(role);
}
