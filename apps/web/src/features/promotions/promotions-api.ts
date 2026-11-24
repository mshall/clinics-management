import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/http";
import "./promotions-i18n";
import type { LedgerRow, PromotionView, buildBody } from "./promotions-logic";

/** GRW-P2-S client. The clinic funds the discount from its own credit; every call is the owner console API of the Clinic. */
const B = "/api/v1/promotions";
type Body = ReturnType<typeof buildBody>;
export const usePromotions = () => useQuery({ queryKey: ["promotions", "list"], queryFn: () => apiGet<PromotionView[]>(B), retry: false });
export const usePromotionLedger = (id: string | null, page = 1) => useQuery({ queryKey: ["promotions", "ledger", id, page], enabled: !!id, queryFn: () => apiGet<{ rows: LedgerRow[]; total: number; page: number; pageSize: number }>(`${B}/${id}/ledger?page=${page}&pageSize=20`), retry: false });
export function usePromotionActions() {
  const qc = useQueryClient(); const done = () => void qc.invalidateQueries({ queryKey: ["promotions"] });
  return {
    create: useMutation({ mutationFn: (b: Body) => apiPost<PromotionView>(B, b), onSuccess: done }),
    newVersion: useMutation({ mutationFn: (v: { id: string; body: Body }) => apiPost<PromotionView>(`${B}/${v.id}/versions`, v.body), onSuccess: done }),
    submit: useMutation({ mutationFn: (id: string) => apiPost<PromotionView>(`${B}/${id}/submit`, {}), onSuccess: done }),
    pause: useMutation({ mutationFn: (v: { id: string; reason?: string }) => apiPost<PromotionView>(`${B}/${v.id}/pause`, { reason: v.reason }), onSuccess: done }),
    resume: useMutation({ mutationFn: (id: string) => apiPost<PromotionView>(`${B}/${id}/resume`, {}), onSuccess: done }),
    archive: useMutation({ mutationFn: (id: string) => apiPost<PromotionView>(`${B}/${id}/archive`, {}), onSuccess: done }),
  };
}
