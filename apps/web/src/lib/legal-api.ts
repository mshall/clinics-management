import { apiUrl } from "@/lib/api-url";
import { apiGet, apiPost } from "@/lib/http";

export type LegalCatalogItem = {
  document: string;
  version: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  effectiveAt: string;
};

const SIGNUP_BASE = ["terms_of_service", "acceptable_use", "dpa", "patient_privacy_notice"] as const;
const SIGNUP_PAID_EXTRA = ["subscription_terms", "refund_policy", "kiorex_marketplace_fees"] as const;

export function requiredLegalIdsForPlan(planKey: "LITE" | "PRO"): string[] {
  if (planKey === "LITE") return [...SIGNUP_BASE];
  return [...SIGNUP_BASE, ...SIGNUP_PAID_EXTRA];
}

export async function fetchLegalCatalog(): Promise<LegalCatalogItem[]> {
  const res = await fetch(apiUrl("/api/v1/public/legal"));
  if (!res.ok) throw new Error("Could not load legal documents");
  const body = (await res.json()) as { items: LegalCatalogItem[] };
  return body.items;
}

export async function fetchLegalDocument(doc: string): Promise<LegalCatalogItem> {
  const res = await fetch(apiUrl(`/api/v1/public/legal/${encodeURIComponent(doc)}`));
  if (!res.ok) throw new Error("Document not found");
  return (await res.json()) as LegalCatalogItem;
}

export type LegalStatus = {
  packVersion: string;
  pending: { document: string; version: string; titleEn: string; titleAr: string }[];
  satisfied: boolean;
};

export function fetchLegalStatus(): Promise<LegalStatus> {
  return apiGet<LegalStatus>("/api/v1/legal/status");
}

export function postLegalAccept(acceptances: { document: string; version: string }[]): Promise<LegalStatus> {
  return apiPost<LegalStatus>("/api/v1/legal/accept", { acceptances });
}