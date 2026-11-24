import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import "./credits-i18n";
import type { CreditSection, CreditWallet } from "./credits-logic";

/** GRW-P2-W client. Read only: grants come from the platform, spending from invoices. */
export const useCreditWallet = (page = 1, pageSize = 25) =>
  useQuery({ queryKey: ["credits", "wallet", page, pageSize], queryFn: () => apiGet<CreditWallet>(`/api/v1/credits/wallet?page=${page}&pageSize=${pageSize}`), retry: false });
export const useCreditSection = (period: string) =>
  useQuery({ queryKey: ["credits", "statement", period], queryFn: () => apiGet<CreditSection>(`/api/v1/credits/statement/${encodeURIComponent(period)}`), retry: false });
