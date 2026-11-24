import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/http";

/** GRW-P4-C: companies my organisation referred to Kiorex (tracking only, no reward). */
export type B2bReferral = { id: string; clinicId: string; companyName: string; sizeBucket: string; contactRef: string | null; status: "SUBMITTED"; createdAt: string };
export const useB2bReferrals = () => useQuery({ queryKey: ["growth", "b2b"], queryFn: () => apiGet<{ items: B2bReferral[]; note: { reward: "NONE"; message: string } }>("/api/v1/growth/b2b-referrals") });
export function useCreateB2b() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { clinicId: string; companyName: string; sizeBucket: string; contactRef?: string }) => apiPost<B2bReferral>("/api/v1/growth/b2b-referrals", b), onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth", "b2b"] }) });
}
