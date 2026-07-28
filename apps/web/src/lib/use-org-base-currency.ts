import { useAdminOverviewQuery } from "@/lib/api-hooks";
import type { BaseCurrency } from "@/lib/base-currencies";
import { asBaseCurrency } from "@/lib/money-display";
import { useAuthStore } from "@/stores/auth-store";

/** Organization base currency from session or admin overview (never hardcode AED in UI). */
export function useOrgBaseCurrency(): BaseCurrency {
  const tenantBaseCurrency = useAuthStore((s) => s.user?.tenantBaseCurrency);
  const adminOv = useAdminOverviewQuery();
  const fromOverview = adminOv.data?.currentTenant?.baseCurrency;
  return asBaseCurrency(tenantBaseCurrency ?? fromOverview ?? "AED");
}
