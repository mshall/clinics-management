import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { ConnectDto } from "./kiorex-connect-types";

export const connectKey = (clinicId: string) => ["kiorex", "connect", clinicId] as const;
export const useKiorexConnect = (clinicId: string) => useQuery({ queryKey: connectKey(clinicId), queryFn: () => apiGet<ConnectDto>(`/api/v1/kiorex/connect?clinicId=${encodeURIComponent(clinicId)}`), enabled: Boolean(clinicId), refetchInterval: (q) => (q.state.data?.status === "REQUESTED" ? 15_000 : false) });