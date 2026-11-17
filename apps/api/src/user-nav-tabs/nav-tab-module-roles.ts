import { UserRole } from "@prisma/client";
import { EMPLOYEE_MANAGE_ROLES } from "../common/employee-manage-roles";
import { rolesWithNavTab } from "./nav-tab-keys";

/** Revenue ledger (list/totals). */
export const REVENUE_VIEW_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CLINIC_ADMIN,
  UserRole.CLINIC_ASSISTANT,
  UserRole.PHYSICIAN,
]);

export const REVENUE_MUTATE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CLINIC_ADMIN,
]);

export const PATIENT_MUTATE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.CLINIC_ASSISTANT,
  UserRole.BRANCH_MANAGER,
  UserRole.CALL_CENTER,
]);

export const HR_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("hr");
export const HR_MUTATE_ROLES: ReadonlySet<UserRole> = EMPLOYEE_MANAGE_ROLES;

export const REPORTS_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("reports");

export const CLINICS_MUTATE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
]);

export const CLINICS_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("clinics");

export const SUPPORT_VIEW_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.CALL_CENTER,
]);

export const SUPPORT_MUTATE_ROLES: ReadonlySet<UserRole> = SUPPORT_VIEW_ROLES;

export const DASHBOARD_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("dashboard");

export const PATIENTS_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("patients");

export const APPOINTMENTS_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("appointments");
export const APPOINTMENTS_MUTATE_ROLES: ReadonlySet<UserRole> = APPOINTMENTS_VIEW_ROLES;

export const ENCOUNTERS_VIEW_ROLES: ReadonlySet<UserRole> = rolesWithNavTab("encounters");
export const ENCOUNTERS_MUTATE_ROLES: ReadonlySet<UserRole> = ENCOUNTERS_VIEW_ROLES;