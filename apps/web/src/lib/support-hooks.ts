import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { Paginated } from "@/lib/paginated";
import type {
  AdminInsights360Dto,
  StaffPerformanceDto,
  SupportTicketDto,
  SupportTrackingLogDto,
} from "@/lib/support-types";

function rangeQuery(from: string, to: string): string {
  const q = new URLSearchParams();
  if (from) q.set("from", new Date(`${from}T00:00:00.000Z`).toISOString());
  if (to) q.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function useSupportTicketsQuery(params: {
  page: number;
  pageSize: number;
  q: string;
  status?: string;
}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  if (params.q.trim()) q.set("q", params.q.trim());
  if (params.status) q.set("status", params.status);
  return useQuery({
    queryKey: ["support", "tickets", params.page, params.pageSize, params.q, params.status],
    queryFn: () => apiGet<Paginated<SupportTicketDto>>(`/api/v1/support/tickets?${q.toString()}`),
  });
}

export function useSupportTicketQuery(id: string | null) {
  return useQuery({
    queryKey: ["support", "ticket", id],
    queryFn: () => apiGet<SupportTicketDto>(`/api/v1/support/tickets/${id}`),
    enabled: Boolean(id),
  });
}

export function useSupportTrackingLogsQuery(params: { page: number; pageSize: number; q: string }) {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  if (params.q.trim()) q.set("q", params.q.trim());
  return useQuery({
    queryKey: ["support", "tracking", params.page, params.pageSize, params.q],
    queryFn: () => apiGet<Paginated<SupportTrackingLogDto>>(`/api/v1/support/tracking/logs?${q.toString()}`),
  });
}

export function useAdminInsights360Query(from: string, to: string) {
  return useQuery({
    queryKey: ["admin", "insights", "360", from, to],
    queryFn: () => apiGet<AdminInsights360Dto>(`/api/v1/admin/insights/overview-360${rangeQuery(from, to)}`),
  });
}

export function useAdminStaffPerformanceQuery(from: string, to: string) {
  return useQuery({
    queryKey: ["admin", "insights", "staff", from, to],
    queryFn: () => apiGet<StaffPerformanceDto>(`/api/v1/admin/insights/staff-performance${rangeQuery(from, to)}`),
  });
}
