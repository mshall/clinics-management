import type { DemoRole } from "@/lib/roles";

export type NavItemKey =
  | "dashboard"
  | "patients"
  | "encounters"
  | "appointments"
  | "clinics"
  | "expenses"
  | "revenue"
  | "clinic_revenue"
  | "hr"
  | "reports"
  | "admin"
  | "doctor_revenue"
  | "profile";

const FULL: NavItemKey[] = [
  "dashboard",
  "patients",
  "encounters",
  "appointments",
  "clinics",
  "expenses",
  "revenue",
  "hr",
  "reports",
  "admin",
];

const ROLE_KEYS: Record<DemoRole, NavItemKey[]> = {
  group_admin: FULL,
  branch_manager: FULL,
  finance_officer: FULL,
  hr_officer: FULL,
  physician: ["patients", "encounters", "appointments", "doctor_revenue", "profile", "reports"],
  nurse: ["patients", "appointments", "encounters"],
  receptionist: ["patients", "appointments", "encounters"],
  clinic_admin: [
    "dashboard",
    "patients",
    "appointments",
    "encounters",
    "clinics",
    "expenses",
    "clinic_revenue",
    "reports",
    "admin",
  ],
  clinic_assistant: ["patients", "appointments", "encounters"],
};

export function navKeysForRole(role: DemoRole | undefined): Set<NavItemKey> {
  if (!role) return new Set();
  return new Set(ROLE_KEYS[role] ?? FULL);
}

export function showNavItem(role: DemoRole | undefined, key: NavItemKey): boolean {
  return navKeysForRole(role).has(key);
}

/** Landing path after sign-in when the dashboard is not in the role menu. */
export function defaultHomeForRole(role: DemoRole | undefined): string {
  if (!role) return "/";
  if (role === "nurse" || role === "receptionist" || role === "clinic_assistant") return "/patients";
  if (role === "physician") return "/patients";
  return "/";
}
