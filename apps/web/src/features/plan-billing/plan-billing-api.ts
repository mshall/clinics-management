import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/http";
import "./plan-billing-i18n";
import type { PlanCompare, RenewalState } from "./plan-billing-logic";

export type PaymentMethodRow = { id: string; provider: string; kind: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; isDefault: boolean };
export type InvoiceRow = { id: string; number: string; periodKey: string; status: string; currency: string; total: string; amountDue: string; issuedAt: string | null };

export const usePlanRenewal = () => useQuery({ queryKey: ["planBilling", "renewal"], queryFn: () => apiGet<RenewalState>("/api/v1/billing/subscription/renewal"), retry: false });
export const usePlanCompare = () => useQuery({ queryKey: ["planBilling", "compare"], queryFn: () => apiGet<PlanCompare>("/api/v1/billing/plans/compare"), retry: false });
export const usePaymentMethods = () => useQuery({ queryKey: ["planBilling", "methods"], queryFn: () => apiGet<PaymentMethodRow[]>("/api/v1/billing/payment-methods"), retry: false });
export const useInvoiceHistory = () => useQuery({ queryKey: ["planBilling", "invoices"], queryFn: () => apiGet<{ items: InvoiceRow[] }>("/api/v1/billing/invoices?page=1&pageSize=12"), retry: false });

export function useInvalidatePlanBilling() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["planBilling"] });
    void qc.invalidateQueries({ queryKey: ["billing"] });
    void qc.invalidateQueries({ queryKey: ["auth"] });
  };
}
export const useSetAutoRenew = () => {
  const done = useInvalidatePlanBilling();
  return useMutation({ mutationFn: (b: { enabled: boolean; confirmDowngrade?: boolean }) => apiPost<RenewalState>("/api/v1/billing/subscription/auto-renew", b), onSuccess: done });
};
export const useUpgrade = () => {
  const done = useInvalidatePlanBilling();
  return useMutation({
    mutationFn: (b: { planKey: string; interval: "MONTHLY" | "ANNUAL" }) => apiPost<{ reactivated: boolean; needsPaymentMethod: boolean }>("/api/v1/billing/subscription/reactivate", b),
    onSuccess: done,
  });
};
