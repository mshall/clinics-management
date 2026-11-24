import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiFetchBlob, apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";
import "./growth-i18n";
import type { LinkScope } from "./growth-logic";

export type GrowthLevel = "admin" | "marketing" | "read" | "none";
export type GrowthAccess = {
  level: GrowthLevel;
  can: { view: boolean; create: boolean; update: boolean; revoke: boolean; widget: boolean };
  plan: { key: string; maxActiveLinks: number; widget: boolean; trendDays: number; linksUsed: number };
};
export type LinkTotals = { visits: number; bookings: number; attended: number };
export type GrowthLink = {
  id: string;
  code: string;
  label: string;
  ownerScope: LinkScope;
  channelKind: string;
  status: "ACTIVE" | "PAUSED" | "REVOKED";
  clinicId: string;
  clinicianId: string | null;
  branchRef: string | null;
  deskLabel: string | null;
  tags: Record<string, string>;
  targetNameEn: string;
  targetNameAr: string;
  shortUrl: string;
  trackedUrl: string | null;
  createdAt: string;
  revokedAt: string | null;
  last30: LinkTotals;
};
export type ProfilePreview = {
  clinicId: string;
  nameEn: string;
  nameAr: string;
  slug: string | null;
  pageUrl: string | null;
  bookableVisitTypes: number;
  ready: boolean;
  doctors: Array<{ clinicianId: string; slug: string | null; nameEn: string; nameAr: string; titleEn: string | null; titleAr: string | null }>;
};
export type WidgetSettingsDto = {
  clinicId: string;
  enabled: boolean;
  allowedOrigins: string[];
  theme: "auto" | "light" | "dark";
  locale: "ar" | "en";
  settings: { brandColor: string | null; languages: ("ar" | "en")[]; doctorIds: string[]; branchIds: string[] };
  entitled: boolean;
  requiredPlan: string | null;
  maxOrigins: number;
  updatedAt: string | null;
  snippets: { baseUrl: string; script: string; iframe: string } | null;
};
export type OriginStats = { bookings: number; attended: number; cancelledOrNoShow: number; newPatients: number; attendedRate: number | null; cancellationRate: number | null };
export type PerformanceDto = {
  days: number;
  providerOriginated: OriginStats;
  marketplaceOriginated: OriginStats;
  links: { visits: number; bookings: number; attended: number; visitToBooking: number | null; bookingToAttended: number | null };
  incrementalMarketplaceRevenue: number;
  trend: Array<{ week: string; provider: number; marketplace: number }>;
  commission: { currency: string; total: number; byMonth: Array<{ month: string; amount: number; charges: number }>; decisions: Record<string, number>; incrementalRevenueNet: number };
};
export type RecommendationDto = { id: string; severity: "high" | "medium" | "low"; params: Record<string, number>; action: "availability" | "profile" | "bookings" | "links" | "widget" | "page" | "visit_types" };
export type StatementDto = {
  period: string;
  currency: string;
  chargesByStatus: Record<string, { count: number; amount: string }>;
  providerLedBookings: number;
  totals: { expectedFromDecisions: string; activeCharges: string; reversedOrWaived: string };
  byDecision: Record<string, number>;
  byOrigin: Record<string, number>;
  noChargeReasons: Record<string, number>;
  mismatches: Array<{ appointmentId: string; kind: string; expected: string; actual: string }>;
  reconciled: boolean;
};

const q = (clinicId?: string) => (clinicId ? `clinicId=${encodeURIComponent(clinicId)}` : "");
const key = (...k: Array<string | number | undefined>) => ["growth", ...k] as const;

export const useGrowthAccess = () => useQuery({ queryKey: key("access"), queryFn: () => apiGet<GrowthAccess>("/api/v1/growth/access"), retry: false });
export const useGrowthLinks = (clinicId?: string) => useQuery({ queryKey: key("links", clinicId), queryFn: () => apiGet<{ items: GrowthLink[] }>(`/api/v1/growth/links?${q(clinicId)}`), retry: false });
export const useProfilePreview = (clinicId: string) => useQuery({ queryKey: key("profile", clinicId), queryFn: () => apiGet<ProfilePreview>(`/api/v1/growth/profile-preview?${q(clinicId)}`), enabled: Boolean(clinicId), retry: false });
export const useWidgetSettings = (clinicId: string) => useQuery({ queryKey: key("widget", clinicId), queryFn: () => apiGet<WidgetSettingsDto>(`/api/v1/growth/widget?${q(clinicId)}`), enabled: Boolean(clinicId), retry: false });
export const usePerformance = (clinicId: string, days: number) => useQuery({ queryKey: key("perf", clinicId, days), queryFn: () => apiGet<PerformanceDto>(`/api/v1/growth/performance?${q(clinicId)}&days=${days}`), enabled: Boolean(clinicId), retry: false });
export const useRecommendations = (clinicId: string) => useQuery({ queryKey: key("recs", clinicId), queryFn: () => apiGet<{ items: RecommendationDto[] }>(`/api/v1/growth/recommendations?${q(clinicId)}`), enabled: Boolean(clinicId), retry: false });
export const useStatement = (clinicId: string, period: string) => useQuery({ queryKey: key("statement", clinicId, period), queryFn: () => apiGet<StatementDto>(`/api/v1/kiorex/commission-statement?${q(clinicId)}&period=${period}`), enabled: Boolean(clinicId), retry: false });

export type CreateLinkInput = { clinicId: string; ownerScope: LinkScope; channelKind: string; label: string; clinicianId?: string; branchRef?: string; deskLabel?: string; tags?: Record<string, string> };

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: CreateLinkInput) => apiPost<GrowthLink>("/api/v1/growth/links", b), onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth"] }) });
}
export function useUpdateLink() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; body: { label?: string; status?: string } }) => apiPatch<GrowthLink>(`/api/v1/growth/links/${encodeURIComponent(v.id)}`, v.body), onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth"] }) });
}
export function usePutWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { clinicId: string; enabled: boolean; allowedOrigins: string[]; theme: string; locale: string; settings: WidgetSettingsDto["settings"] }) => apiPut<WidgetSettingsDto>("/api/v1/growth/widget", b),
    onSuccess: (d) => qc.setQueryData(key("widget", d.clinicId), d),
  });
}

/** Authenticated fetches that cannot be plain links (the API needs the bearer token). */
export const qrBlobUrl = async (id: string, kind: "svg" | "png") => URL.createObjectURL((await apiFetchBlob(`/api/v1/growth/links/${encodeURIComponent(id)}/qr.${kind}${kind === "png" ? "?width=768" : ""}`)).blob);
export const downloadQr = (id: string, kind: "svg" | "png", name: string) => apiDownload(`/api/v1/growth/links/${encodeURIComponent(id)}/qr.${kind}${kind === "png" ? "?width=1024" : ""}`, `${name}.${kind}`);
export const downloadVcard = (id: string, name: string) => apiDownload(`/api/v1/growth/links/${encodeURIComponent(id)}/vcard`, `${name}.vcf`);
export const fetchPosterHtml = async (id: string, o: { lang: string; size: string; kind: string }) =>
  (await apiFetchBlob(`/api/v1/growth/links/${encodeURIComponent(id)}/poster?lang=${o.lang}&size=${o.size}&kind=${o.kind}&print=1`)).blob.text();
