import { useCallback } from "react";
import { useClinicsQuery } from "@/lib/api-hooks";
import type { BaseCurrency } from "@/lib/base-currencies";
import { resolveClinicCurrencyCode } from "@/lib/money-display";
import { useOrgBaseCurrency } from "@/lib/use-org-base-currency";

/** Resolves clinic currency (clinic override or org base) for the current tenant. */
export function useClinicCurrencyResolver(): (clinicId: string | undefined) => BaseCurrency {
  const { data: clinics = [] } = useClinicsQuery();
  const orgBaseCurrency = useOrgBaseCurrency();
  return useCallback(
    (clinicId: string | undefined) => resolveClinicCurrencyCode(clinics, clinicId, orgBaseCurrency),
    [clinics, orgBaseCurrency],
  );
}
