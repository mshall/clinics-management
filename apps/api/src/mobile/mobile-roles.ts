import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { effectiveRoles, hasAnyRole } from "../common/effective-roles";
import { isHomeVisitManager } from "../home-visits/home-visit-config.service";

const R = UserRole;
export const MANAGER_ROLES = [R.GROUP_ADMIN, R.GROUP_SUPERVISOR, R.BRANCH_MANAGER, R.CLINIC_ADMIN] as const;
export const CLINICIAN_ROLES = [R.PHYSICIAN, R.NURSE] as const;
export const SIGNING_ROLES = [R.PHYSICIAN, R.GROUP_ADMIN, R.GROUP_SUPERVISOR] as const;
export const VITALS_ROLES = [R.PHYSICIAN, R.NURSE, R.CLINIC_ASSISTANT, R.BRANCH_MANAGER, R.GROUP_ADMIN, R.GROUP_SUPERVISOR, R.CLINIC_ADMIN] as const;
export const REVENUE_ROLES = [R.GROUP_ADMIN, R.GROUP_SUPERVISOR, R.BRANCH_MANAGER, R.FINANCE_OFFICER, R.CLINIC_ADMIN] as const;
export const ALERT_ROLES = [R.GROUP_ADMIN, R.GROUP_SUPERVISOR, R.BRANCH_MANAGER, R.CLINIC_ADMIN, R.PHYSICIAN, R.NURSE] as const;

/** Nurse-edition agency dispatchers (front-desk roles): coordinate nurses, see home-visit safety alerts, no clinical-record or prescription access. */
export const DISPATCHER_ROLES = [R.RECEPTIONIST, R.CALL_CENTER] as const;

export const isOwner = (u: JwtUser) => Boolean(u.isTenantOwner);
export const can = (u: JwtUser, roles: readonly UserRole[]) => isOwner(u) || hasAnyRole(u, roles);
export { isHomeVisitManager, effectiveRoles };

interface ModuleDef { key: string; allow: readonly UserRole[]; screens: string[]; nurseEdition?: boolean }
export const MODULES: ModuleDef[] = [
  { key: "clinic.schedule", allow: [R.PHYSICIAN, R.NURSE, R.RECEPTIONIST, R.CALL_CENTER, R.CLINIC_ASSISTANT, R.BRANCH_MANAGER, R.GROUP_ADMIN, R.GROUP_SUPERVISOR, R.CLINIC_ADMIN, R.FINANCE_OFFICER], screens: ["today", "queue", "detail"] },
  { key: "clinic.patients", allow: [R.PHYSICIAN, R.NURSE, R.RECEPTIONIST, R.CALL_CENTER, R.CLINIC_ASSISTANT, R.BRANCH_MANAGER, R.GROUP_ADMIN, R.GROUP_SUPERVISOR, R.CLINIC_ADMIN], screens: ["search", "summary"] },
  { key: "clinic.visits", allow: [R.PHYSICIAN, R.GROUP_ADMIN, R.GROUP_SUPERVISOR], screens: ["start", "notes"] },
  { key: "clinic.prescriptions", allow: [R.PHYSICIAN, R.GROUP_ADMIN, R.GROUP_SUPERVISOR], screens: ["review", "sign"] },
  { key: "clinic.labs", allow: [R.PHYSICIAN, R.NURSE, R.GROUP_ADMIN, R.GROUP_SUPERVISOR], screens: ["results", "approve"] },
  { key: "clinic.vitals", allow: VITALS_ROLES, screens: ["entry", "trend"] },
  { key: "clinic.homevisits", allow: [R.NURSE, R.PHYSICIAN], screens: ["round", "checkin", "safety", "sample"], nurseEdition: true },
  { key: "clinic.revenue", allow: REVENUE_ROLES, screens: ["snapshot"] },
];

/** Professions that never sign prescriptions or approve results (scope of practice, ADR-029): nurses and assistants. */
export const NON_PRESCRIBING_PROFESSIONS = ["NURSE", "ASSISTANT"];

export function modulesFor(u: JwtUser, edition: string, profession?: string | null) {
  const roles = effectiveRoles(u);
  return MODULES.map((m) => {
    const byRole = u.isTenantOwner || roles.some((r) => m.allow.includes(r));
    const byEdition = Boolean(m.nurseEdition) && edition === "NURSE" && roles.some((r) => ([R.NURSE, R.PHYSICIAN, R.BRANCH_MANAGER, R.GROUP_ADMIN, R.CLINIC_ADMIN, R.CLINIC_ASSISTANT, ...DISPATCHER_ROLES] as UserRole[]).includes(r));
    const enabled = m.key === "clinic.homevisits" ? byEdition || roles.includes(R.NURSE) : byRole;
    const blocked = Boolean(profession && NON_PRESCRIBING_PROFESSIONS.includes(profession)) && (m.key === "clinic.visits" || m.key === "clinic.prescriptions");
    const on = enabled && !blocked;
    return { key: m.key, enabled: on, screens: on ? m.screens : [] };
  });
}
