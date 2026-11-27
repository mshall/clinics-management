import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/http";
import "./pay-i18n";

export type MatchStatus = "OPEN" | "APPLIED" | "CONFIRMED" | "REJECTED";
export type InvoiceBrief = { id: string; invoiceNumber: string; patientName: string; currency: string; outstanding: number };
export type MatchItem = {
  id: string; bankRef: string; reference: string | null; amount: number; currency: string; paidAt: string; payerMasked: string | null; eventKind: string;
  decision: "AUTO" | "REVIEW" | "UNMATCHED"; status: MatchStatus; confidence: number; reasons: string[]; note: string | null;
  targetInvoice: InvoiceBrief | null;
  candidateInvoices: { targetId: string; confidence: number; reasons: string[]; invoice: InvoiceBrief | null }[];
};
export type MatchSummary = { byStatus: Record<string, number>; openByDecision: Record<string, number>; floors: { autoThresholdMin: number; autoMarginMin: number; reviewThresholdMin: number }; config: { autoThreshold: number; autoMargin: number; reviewThreshold: number } };
export type InvoiceCandidate = { id: string; invoiceNumber: string; patientName: string; currency: string; issueDate: string; outstanding: number };
export type AuditEvent = { at: string; action: string; actor: string | null; detail: unknown };
export type LinkRow = { id: string; state: string; context: string; amount: number; currency: string; expiresAt: string; usedAt: string | null; invoice: { id: string; invoiceNumber: string; patientName: string } | null };
export type InvoiceStatus = {
  invoice: { id: string; clinicId: string; invoiceNumber: string; patientName: string; currency: string; total: number; outstanding: number; state: string };
  links: { id: string; state: string; amount: number; currency: string; context: string; expiresAt: string; usedAt: string | null }[];
  matches: { id: string; status: string; decision: string; amount: number; currency: string; bankRef: string; confidence: number; paidAt: string }[];
  payments: { id: string; total: number; currency: string; at: string; methods: string[] }[];
  refunds: { id: string; status: string; amount: number; reason: string; at: string }[];
};
export type RefundRow = { id: string; amount: number; currency: string; reason: string; status: string; paymentId: string | null; createdAt: string };
export type CreatedLink = { id: string; token: string; url: string; expiresAt: string; amountMinor: number; currency: string; qr: { kind: string; content: string } };
export type PublicLink = { status: "ACTIVE" | "USED" | "EXPIRED" | "CANCELLED"; amount: number; currency: string; expiresAt: string; reference: string | null; clinicNameEn: string | null; clinicNameAr: string | null; channels: { name: string; mobileNumber: string | null; accountNumber: string | null }[] };

export const PAY_FLAG = "clinic.pay_collections";
const B = "/api/v1/billing/pay";
export const useMatchSummary = () => useQuery({ queryKey: ["pay", "summary"], queryFn: () => apiGet<MatchSummary>(`${B}/matching/summary`), retry: false });
export const useMatchQueue = (status: MatchStatus) => useQuery({ queryKey: ["pay", "queue", status], queryFn: () => apiGet<MatchItem[]>(`${B}/matching/queue?status=${status}`), retry: false });
export const useInvoiceSearch = (q: string, enabled: boolean) => useQuery({ queryKey: ["pay", "invoices", q], enabled, queryFn: () => apiGet<InvoiceCandidate[]>(`${B}/matching/invoices?q=${encodeURIComponent(q)}`), retry: false });
export const useMatchAudit = (id: string | null) => useQuery({ queryKey: ["pay", "audit", id], enabled: !!id, queryFn: () => apiGet<{ id: string; status: string; events: AuditEvent[] }>(`${B}/matching/${id}/audit`), retry: false });
export const useInvoiceStatus = (id: string | null) => useQuery({ queryKey: ["pay", "invoice-status", id], enabled: !!id, queryFn: () => apiGet<InvoiceStatus>(`${B}/invoices/${id}/status`), retry: false });
export const useLinks = () => useQuery({ queryKey: ["pay", "links"], queryFn: () => apiGet<{ items: LinkRow[] }>(`${B}/links`), retry: false });
export const useRefunds = () => useQuery({ queryKey: ["pay", "refunds"], queryFn: () => apiGet<{ items: RefundRow[] }>("/api/v1/billing/refunds"), retry: false });

function useInvalidating<T, V>(fn: (v: V) => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["pay"] }) });
}
export const useUploadIpn = () => useInvalidating((v: { content: string; format: "csv" | "json"; filename?: string }) => apiPost<{ received: number; applied: number; queued: number; duplicates: number; rejected: unknown[] }>(`${B}/matching/ipn`, v));
export const useConfirmMatch = () => useInvalidating((v: { id: string; invoiceId: string }) => apiPost(`${B}/matching/${v.id}/confirm`, { invoiceId: v.invoiceId }));
export const useRejectMatch = () => useInvalidating((v: { id: string; note?: string }) => apiPost(`${B}/matching/${v.id}/reject`, { note: v.note }));
export const useCreateLink = () => useInvalidating((v: { invoiceId: string; clinicId: string }) => apiPost<CreatedLink>(`${B}/links`, { context: "CLINIC_INVOICE", subjectId: v.invoiceId, invoiceId: v.invoiceId, clinicId: v.clinicId }));
export const useCancelLink = () => useInvalidating((id: string) => apiPost(`${B}/links/${id}/cancel`, {}));
export const useRequestRefund = () => useInvalidating((v: { paymentId: string; amount: number; reason: string }) => apiPost("/api/v1/billing/refunds", v));
export const useDecideRefund = () => useInvalidating((v: { id: string; decision: "approve" | "reject" }) => apiPost(`/api/v1/billing/refunds/${v.id}/${v.decision}`, {}));
export const useRollup = (level: string, from: string, to: string) => useQuery({ queryKey: ["pay", "rollup", level, from, to], queryFn: () => apiGet<{ lines: { key: string; currency: string; count: number; capturedMinor: number; refundedMinor: number; netMinor: number }[] }>(`${B}/reports/rollup?level=${level}&from=${from}&to=${to}`), retry: false });

/** Public (no sign-in): what the payer sees behind a payment link. */
export async function fetchPublicLink(token: string): Promise<PublicLink> {
  const { apiUrl } = await import("@/lib/api-url");
  const res = await fetch(apiUrl(`/api/v1/public/pay/l/${encodeURIComponent(token)}`));
  const body = (await res.json().catch(() => ({}))) as PublicLink & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
  return body;
}
