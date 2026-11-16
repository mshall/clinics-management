import { useTranslation } from "react-i18next";
import type { NavItemKey } from "@/lib/nav-policy";

export const NAV_TAB_I18N: Record<NavItemKey, string> = {
  platform: "nav.platformOverview",
  platform_insights: "nav.platformInsights",
  platform_markets: "nav.platformMarkets",
  platform_organizations: "nav.platformOrganizations",
  platform_users: "nav.platformUsers",
  platform_clinics: "nav.platformClinics",
  dashboard: "nav.dashboard",
  patients: "nav.patients",
  encounters: "nav.encounters",
  appointments: "nav.appointments",
  operations: "nav.operations",
  clinics: "nav.clinics",
  expenses: "nav.expenses",
  revenue: "nav.revenue",
  hr: "nav.hr",
  reports: "nav.reports",
  customer_support: "nav.customerSupport",
  admin: "nav.admin",
  doctor_revenue: "nav.doctorRevenue",
  profile: "nav.profile",
};

export function NavTabChecklist({
  orderedKeys,
  draft,
  onToggle,
  disabled,
  allowedKeys,
}: {
  orderedKeys: NavItemKey[];
  draft: Set<NavItemKey>;
  onToggle: (key: NavItemKey) => void;
  disabled?: boolean;
  allowedKeys?: Set<NavItemKey>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {orderedKeys.map((key) => {
        const locked = key !== "profile" && allowedKeys != null && !allowedKeys.has(key);
        return (
          <label
            key={key}
            className={`flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${locked ? "opacity-50" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={draft.has(key)}
              disabled={key === "profile" || disabled || locked}
              onChange={() => onToggle(key)}
            />
            <span>{t(NAV_TAB_I18N[key])}</span>
          </label>
        );
      })}
    </div>
  );
}