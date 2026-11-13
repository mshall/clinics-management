/** Web app routes mirrored for assistant navigation actions (keep in sync with apps/web nav-policy). */
export const ASSISTANT_NAV_PATH: Record<string, string> = {
  platform: "/platform",
  platform_organizations: "/platform/organizations",
  platform_users: "/platform/users",
  platform_clinics: "/platform/clinics",
  dashboard: "/",
  patients: "/patients",
  encounters: "/encounters",
  appointments: "/appointments",
  operations: "/operations",
  clinics: "/clinics",
  expenses: "/expenses",
  revenue: "/revenue",
  hr: "/hr",
  reports: "/reports",
  customer_support: "/customer-support",
  admin: "/admin",
  doctor_revenue: "/doctor-revenue",
  profile: "/profile",
};

export function navPathForKey(navKey: string): string | undefined {
  return ASSISTANT_NAV_PATH[navKey];
}
