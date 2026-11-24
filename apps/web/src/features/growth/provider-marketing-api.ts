import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiGet, apiPost } from "@/lib/http";
import "./growth-i18n";
import "./provider-marketing-i18n";

/** GRW-P2-C client for the provider marketing portal. Server is the authority for every rule (content guard, roles, slots). */
export type SocialTemplate = { id: string; slug: string; kind: "POST" | "STORY" | "FLYER" | "WHATSAPP_MESSAGE" | "SMS_TEXT"; locale: "ar" | "en"; title: string; body: string; layoutKey: string; protectedFooter: string; version: number; shares30d: number; needsDoctor: boolean };
export type RenderedCard = { templateId: string; locale: "ar" | "en"; caption: string; link: string; linkCode: string; layout: string; svg: string; pngBase64?: string };
export type ShareableSlot = { startsAt: string; endsAt: string; labelEn: string; labelAr: string };
export type ShareableSlotsDto = { clinicId: string; clinicianId: string; timezone: string; days: number; items: ShareableSlot[]; typeId: string };
export type SlotCard = { clinicId: string; clinicianId: string; locale: "ar" | "en"; link: string; linkCode: string; slots: string[]; caption: string; svg: string; pngBase64?: string };
export type VerificationField = "LICENSE_NUMBER" | "SPECIALTY" | "ADDRESS" | "DISPLAY_NAME" | "PHOTO" | "DOCUMENT";
export type VerificationStatus = "SUBMITTED" | "NEEDS_INFO" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type VerificationRequest = { id: string; clinicId: string; field: VerificationField; oldRef: string | null; status: VerificationStatus; evidenceCount: number; evidenceFileRefs: string[]; kiorexRef: string | null; decisionNote: string | null; decidedAt: string | null; createdAt: string; updatedAt: string };
export type VerificationList = { items: VerificationRequest[]; badge: "VERIFIED" | "UPDATE_UNDER_REVIEW"; policy: { reVerifyOnLicenseChange: boolean } };
export type StatementLineDto = { appointmentId: string; date: string; isNewPatient: boolean; origin: string; bookingSource: string; decision: "CHARGE" | "NO_CHARGE" | "WAIVED"; reasonCodes: string[]; rate: string | null; amount: string | null; chargeStatus: string | null; dispute: string | null };
export type StatementV2 = { month: string; zone: string; currency: string; lines: StatementLineDto[]; totals: { active: string; activeCount: number; reversed: string; waived: string; providerLed: number; disputesOpen: number; decisions: Record<string, number> }; statement: string };
export type StatementExportDto = { id: string; month: string; kind: "PDF" | "CSV"; checksum: string; createdAt: string };

const key = (...k: Array<string | number | undefined>) => ["growth", "pm", ...k] as const;
const q = (p: Record<string, string | number | undefined>) => Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const useSocialTemplates = (clinicId: string, locale?: string) => useQuery({ queryKey: key("templates", clinicId, locale), queryFn: () => apiGet<{ items: SocialTemplate[]; guardrail: string }>(`/api/v1/growth/social/templates?${q({ clinicId, locale })}`), enabled: Boolean(clinicId), retry: false });
export const useRenderCard = () => useMutation({ mutationFn: (b: { templateId: string; clinicId: string; clinicianId?: string; customLine?: string; png?: boolean }) => apiPost<RenderedCard>("/api/v1/growth/social/render", b) });
export function useCountShare() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { templateId: string; clinicId: string; channel: string }) => apiPost<{ ok: boolean }>("/api/v1/growth/social/share", b), onSuccess: () => void qc.invalidateQueries({ queryKey: key("templates") }) });
}
export const useShareableSlots = (clinicId: string, clinicianId: string, days: number) => useQuery({ queryKey: key("slots", clinicId, clinicianId, days), queryFn: () => apiGet<ShareableSlotsDto>(`/api/v1/growth/shareable-slots?${q({ clinicId, clinicianId, days })}`), enabled: Boolean(clinicId && clinicianId), retry: false });
export const useSlotCard = () => useMutation({ mutationFn: (b: { clinicId: string; clinicianId: string; startsAt: string[]; locale: "ar" | "en"; png?: boolean }) => apiPost<SlotCard>("/api/v1/growth/shareable-slots/card", b) });

export const useVerificationRequests = (clinicId: string) => useQuery({ queryKey: key("verification", clinicId), queryFn: () => apiGet<VerificationList>(`/api/v1/growth/verification-requests?${q({ clinicId })}`), enabled: Boolean(clinicId), retry: false });
export function useCreateVerification() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { clinicId: string; field: VerificationField; newValue: string; evidenceFileRefs: string[] }) => apiPost<VerificationRequest>("/api/v1/growth/verification-requests", b), onSuccess: () => void qc.invalidateQueries({ queryKey: key("verification") }) });
}
export function useWithdrawVerification() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiPost<VerificationRequest>(`/api/v1/growth/verification-requests/${encodeURIComponent(id)}/withdraw`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: key("verification") }) });
}
export function useAddVerificationEvidence() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; evidenceFileRefs: string[] }) => apiPost<VerificationRequest>(`/api/v1/growth/verification-requests/${encodeURIComponent(v.id)}/evidence`, { evidenceFileRefs: v.evidenceFileRefs }), onSuccess: () => void qc.invalidateQueries({ queryKey: key("verification") }) });
}

export const useStatementV2 = (clinicId: string, month: string) => useQuery({ queryKey: key("statement", clinicId, month), queryFn: () => apiGet<StatementV2>(`/api/v1/billing/kiorex/statements?${q({ month, clinicId })}`), enabled: Boolean(clinicId), retry: false });
export const useStatementExports = (month: string) => useQuery({ queryKey: key("exports", month), queryFn: () => apiGet<{ items: StatementExportDto[] }>(`/api/v1/billing/kiorex/statements/exports?${q({ month })}`), retry: false });
export function downloadStatement(month: string, kind: "csv" | "pdf", clinicId?: string) {
  return apiDownload(`/api/v1/billing/kiorex/statements/${month}.${kind}${clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ""}`, `kiorex-statement-${month}.${kind}`);
}

export function useRecommendationState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; clinicId: string; status: "DISMISSED" | "SNOOZED" | "DONE" | "OPEN"; snoozeDays?: number }) => apiPost<{ id: string; status: string }>(`/api/v1/growth/recommendations/${encodeURIComponent(v.id)}/state`, { clinicId: v.clinicId, status: v.status, snoozeDays: v.snoozeDays }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth", "recs"] }),
  });
}
