import { useQuery } from "@tanstack/react-query";
import type { ClinicDto, GroupOverviewKpisDto, PatientDto } from "@/lib/api-schema";
import type {
  AdminAuditLogItemDto,
  AdminOverviewDto,
  AppointmentDto,
  ClinicDetailDto,
  ClinicRevenueBreakdownDto,
  ClinicPhysicianDto,
  RevenueTotalsDto,
  AttendanceDto,
  EmployeeDto,
  EncounterDetailDto,
  EncounterDocumentDto,
  EncounterMedicationDto,
  ExpenseDto,
  OperationDto,
  OperationDetailDto,
  HrSummaryDto,
  LeaveRequestDto,
  RevenueEntryDto,
  ReportsMonthlySeriesDto,
  ReportsClinicBreakdownDto,
  ReportsPerformanceDto,
  ReportsPatientAcquisitionDto,
  ReportsPatientAcquisitionPatientDto,
  TenantListItemDto,
  UserListItemDto,
} from "@/lib/api-types";
import { ApiError, apiGet } from "@/lib/http";
import type { PatientClinicalDocumentsDto } from "@/lib/patient-document-category";
import type { PatientPhoneConflictResponse } from "@/lib/patient-phone-conflict";
import type { Paginated } from "@/lib/paginated";
import { useAuthStore } from "@/stores/auth-store";
import { defaultMonthRange, useDateRangeStore } from "@/stores/date-range-store";
import { sanitizeReportingRange } from "@/lib/reporting-range";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Encounters ledger must always send a valid YYYY-MM-DD pair; avoid half-empty persisted UI state. */
export function encounterLedgerFromTo(from: string, to: string): { from: string; to: string } {
  const f = from?.trim() ?? "";
  const t = to?.trim() ?? "";
  if (ISO_DAY.test(f) && ISO_DAY.test(t)) return { from: f, to: t };
  return defaultMonthRange();
}

/** Avoid firing authenticated API calls before persisted auth has rehydrated (prevents naked `/api` requests). */
function useHasAuthToken(): boolean {
  return useAuthStore((s) => Boolean(s.accessToken));
}

function resolveRevenueRange(from?: string, to?: string): { from: string; to: string } {
  const d = defaultMonthRange();
  const f = from?.trim() ?? "";
  const t = to?.trim() ?? "";
  if (ISO_DAY.test(f) && ISO_DAY.test(t)) return { from: f, to: t };
  return d;
}

export type { PatientDto, ClinicDto, GroupOverviewKpisDto };
export type {
  EncounterDetailDto,
  EncounterDocumentDto,
  EncounterMedicationDto,
  ExpenseDto,
  RevenueEntryDto,
  EmployeeDto,
  AttendanceDto,
  LeaveRequestDto,
  AppointmentDto,
  HrSummaryDto,
  AdminOverviewDto,
  RevenueTotalsDto,
  TenantListItemDto,
  UserListItemDto,
};

function rangeQs(): string {
  const { from, to } = useDateRangeStore.getState();
  const r = resolveRevenueRange(from, to);
  const q = new URLSearchParams();
  q.set("from", r.from);
  q.set("to", r.to);
  return q.toString();
}

export interface PatientsListParams {
  search?: string;
  mrn?: string;
  phone?: string;
  gender?: string;
  name?: string;
  nationalId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  enabled?: boolean;
}

function patientsQs(p: PatientsListParams): URLSearchParams {
  const q = new URLSearchParams();
  if (p.search?.trim()) q.set("search", p.search.trim());
  if (p.mrn?.trim()) q.set("mrn", p.mrn.trim());
  if (p.phone?.trim()) q.set("phone", p.phone.trim());
  if (p.gender?.trim()) q.set("gender", p.gender.trim());
  if (p.name?.trim()) q.set("name", p.name.trim());
  if (p.nationalId?.trim()) q.set("nationalId", p.nationalId.trim());
  q.set("page", String(p.page ?? 1));
  q.set("pageSize", String(p.pageSize ?? 10));
  if (p.sortBy) q.set("sortBy", p.sortBy);
  if (p.sortOrder) q.set("sortOrder", p.sortOrder);
  return q;
}

export function patientsListQueryKey(params: PatientsListParams) {
  const q = patientsQs(params);
  return ["patients", Object.fromEntries(q.entries())] as const;
}

export function fetchPatientsList(params: PatientsListParams) {
  const q = patientsQs(params);
  return apiGet<Paginated<PatientDto>>(`/api/v1/patients?${q.toString()}`);
}

export function usePatientsQuery(params: PatientsListParams) {
  const hasToken = useHasAuthToken();
  const { enabled = true, ...listParams } = params;
  const q = patientsQs(listParams);
  return useQuery({
    queryKey: ["patients", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<PatientDto>>(`/api/v1/patients?${q.toString()}`),
    enabled: enabled && hasToken,
  });
}

export function usePatientQuery(id: string | undefined) {
  const hasToken = useHasAuthToken();
  return useQuery({
    queryKey: ["patient", id],
    queryFn: () => apiGet<PatientDto>(`/api/v1/patients/${id}`),
    enabled: Boolean(id) && hasToken,
  });
}

export function usePatientClinicalDocumentsQuery(patientId: string | undefined) {
  const hasToken = useHasAuthToken();
  return useQuery({
    queryKey: ["patient", patientId, "clinical-documents"],
    queryFn: () => apiGet<PatientClinicalDocumentsDto>(`/api/v1/patients/${patientId}/clinical-documents`),
    enabled: Boolean(patientId) && hasToken,
  });
}

export function usePatientPhoneConflictQuery(
  phone: string,
  excludePatientId?: string,
  options?: { enabled?: boolean },
) {
  const hasToken = useHasAuthToken();
  const trimmed = phone.trim();
  const enabled = (options?.enabled !== false) && hasToken && trimmed.length > 0;
  const q = new URLSearchParams();
  q.set("phone", trimmed);
  if (excludePatientId?.trim()) q.set("excludePatientId", excludePatientId.trim());
  return useQuery({
    queryKey: ["patients", "phone-conflict", trimmed, excludePatientId ?? ""],
    queryFn: () => apiGet<PatientPhoneConflictResponse>(`/api/v1/patients/phone-conflict?${q.toString()}`),
    enabled,
  });
}

export function useDashboardKpisQuery() {
  const from = useDateRangeStore((s) => s.from);
  const to = useDateRangeStore((s) => s.to);
  return useQuery({
    queryKey: ["dashboard", "kpis", from, to],
    queryFn: () => apiGet<GroupOverviewKpisDto>(`/api/v1/dashboards/group-overview?${rangeQs()}`),
  });
}

export function useClinicsQuery(options?: { includeInactive?: boolean }) {
  const hasToken = useHasAuthToken();
  const includeInactive = options?.includeInactive ?? false;
  const q = includeInactive ? "?includeInactive=true" : "";
  return useQuery({
    queryKey: ["clinics", includeInactive ? "all" : "active"],
    queryFn: () => apiGet<ClinicDto[]>(`/api/v1/clinics${q}`),
    enabled: hasToken,
  });
}

export function useClinicQuery(id: string | undefined) {
  const hasToken = useHasAuthToken();
  return useQuery({
    queryKey: ["clinic", id],
    queryFn: () => apiGet<ClinicDetailDto>(`/api/v1/clinics/${id}`),
    enabled: Boolean(id) && hasToken,
  });
}

export function useSchedulingPhysiciansQuery(params: {
  clinicId?: string;
  search?: string;
  enabled?: boolean;
}) {
  const hasToken = useHasAuthToken();
  const { enabled = true, clinicId, search } = params;
  const q = new URLSearchParams();
  if (clinicId?.trim()) q.set("clinicId", clinicId.trim());
  if (search?.trim()) q.set("search", search.trim());
  return useQuery({
    queryKey: ["clinicians", "scheduling", clinicId ?? "", search ?? ""],
    queryFn: () => apiGet<ClinicPhysicianDto[]>(`/api/v1/clinics/physicians/scheduling?${q.toString()}`),
    enabled: enabled && hasToken,
    placeholderData: (previous) => previous,
  });
}

export function useClinicPhysiciansQuery(clinicId: string | undefined, search?: string) {
  const hasToken = useHasAuthToken();
  const q = new URLSearchParams();
  if (search?.trim()) q.set("search", search.trim());
  const qs = q.toString();
  return useQuery({
    queryKey: ["clinic", clinicId, "physicians", search ?? ""],
    queryFn: () => apiGet<ClinicPhysicianDto[]>(`/api/v1/clinics/${clinicId}/physicians${qs ? `?${qs}` : ""}`),
    enabled: Boolean(clinicId) && hasToken,
  });
}

export function useAvailableClinicPhysiciansQuery(
  clinicId: string | undefined,
  search?: string,
  enabled = true
) {
  const hasToken = useHasAuthToken();
  const q = new URLSearchParams();
  if (search?.trim()) q.set("search", search.trim());
  const qs = q.toString();
  return useQuery({
    queryKey: ["clinic", clinicId, "physicians", "available", search ?? ""],
    queryFn: () => apiGet<ClinicPhysicianDto[]>(`/api/v1/clinics/${clinicId}/physicians/available${qs ? `?${qs}` : ""}`),
    enabled: Boolean(clinicId) && enabled && hasToken,
  });
}

export interface EncountersListParams {
  patientId?: string;
  /** Filter ledger by patient name or MRN (server-side). Ignored when patientId is set. */
  patientSearch?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** When set, overrides the global reporting range (e.g. encounters list ledger). */
  from?: string;
  to?: string;
  /** When false, skip fetch (e.g. wait for route param). */
  enabled?: boolean;
}

export function useEncountersQuery(params: EncountersListParams = {}) {
  const hasToken = useHasAuthToken();
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  const storeFrom = useDateRangeStore((s) => s.from);
  const storeTo = useDateRangeStore((s) => s.to);
  const rawFrom = params.from ?? storeFrom;
  const rawTo = params.to ?? storeTo;
  const patientChart = Boolean(params.patientId?.trim());
  const { from, to } = patientChart ? { from: rawFrom, to: rawTo } : encounterLedgerFromTo(rawFrom, rawTo);
  const q = new URLSearchParams();
  /** Patient chart lists all encounters for the patient; omit reporting range from URL and cache key. */
  if (!patientChart) {
    q.set("from", from);
    q.set("to", to);
  }
  if (params.patientId?.trim()) q.set("patientId", params.patientId.trim());
  if (!patientChart && params.patientSearch?.trim()) q.set("patientSearch", params.patientSearch.trim());
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  const qs = q.toString();
  const enabled = (params.enabled !== false) && hasToken;
  return useQuery({
    queryKey: patientChart
      ? [
          "encounters",
          "patient",
          viewerId,
          viewerRole,
          params.patientId!.trim(),
          params.page ?? 1,
          params.pageSize ?? 10,
          params.sortBy ?? "createdAt",
          params.sortOrder ?? "desc",
        ]
      : [
          "encounters",
          "ledger",
          viewerId,
          viewerRole,
          from,
          to,
          params.patientSearch?.trim() ?? "",
          params.page ?? 1,
          params.pageSize ?? 10,
          params.sortBy ?? "createdAt",
          params.sortOrder ?? "desc",
        ],
    queryFn: () => apiGet<Paginated<EncounterDetailDto>>(`/api/v1/encounters?${qs}`),
    enabled,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => 400 * (attempt + 1),
  });
}

export function useEncounterQuery(id: string | undefined) {
  const hasToken = useHasAuthToken();
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  return useQuery({
    queryKey: ["encounter", id, viewerId, viewerRole],
    queryFn: () => apiGet<EncounterDetailDto>(`/api/v1/encounters/${id}`),
    enabled: Boolean(id) && hasToken,
  });
}

export interface PagedRangeParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ExpensesListParams extends PagedRangeParams {
  /** When set, overrides the global reporting range. */
  from?: string;
  to?: string;
  clinicId?: string;
}

export function useExpensesQuery(params: ExpensesListParams = {}) {
  const storeFrom = useDateRangeStore((s) => s.from);
  const storeTo = useDateRangeStore((s) => s.to);
  const from = params.from ?? storeFrom;
  const to = params.to ?? storeTo;
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("to", to);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: [
      "expenses",
      from,
      to,
      params.clinicId ?? "",
      params.page ?? 1,
      params.pageSize ?? 10,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: () => apiGet<Paginated<ExpenseDto>>(`/api/v1/expenses?${q.toString()}`),
  });
}

export interface OperationsListParams {
  from: string;
  to: string;
  clinicId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function useOperationsQuery(params: OperationsListParams) {
  const storeFrom = useDateRangeStore((s) => s.from);
  const storeTo = useDateRangeStore((s) => s.to);
  const from = params.from ?? storeFrom;
  const to = params.to ?? storeTo;
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("to", to);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  if (params.status?.trim()) q.set("status", params.status.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: [
      "operations",
      from,
      to,
      params.clinicId ?? "",
      params.status ?? "",
      params.page ?? 1,
      params.pageSize ?? 10,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: () => apiGet<Paginated<OperationDto>>(`/api/v1/operations?${q.toString()}`),
  });
}

export function useOperationQuery(id: string | undefined) {
  const hasToken = useHasAuthToken();
  return useQuery({
    queryKey: ["operation", id],
    queryFn: () => apiGet<OperationDetailDto>(`/api/v1/operations/${id}`),
    enabled: Boolean(id) && hasToken,
  });
}

export function usePayableOperationsQuery(clinicId?: string, enabled = true) {
  const q = new URLSearchParams();
  if (clinicId?.trim()) q.set("clinicId", clinicId.trim());
  const qs = q.toString();
  return useQuery({
    queryKey: ["operations", "payable", clinicId ?? ""],
    queryFn: () => apiGet<OperationDto[]>(`/api/v1/operations/payable${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

export interface RevenueListParams {
  from: string;
  to: string;
  clinicId?: string;
  /** When permitted by the API, filter ledger rows to encounters for this physician. */
  clinicianId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  enabled?: boolean;
}

export function useRevenueQuery(params: RevenueListParams) {
  const hasToken = useHasAuthToken();
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const { enabled = true, ...p } = params;
  const { from, to } = resolveRevenueRange(p.from, p.to);
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("to", to);
  q.set("page", String(p.page ?? 1));
  q.set("pageSize", String(p.pageSize ?? 10));
  if (p.clinicId?.trim()) q.set("clinicId", p.clinicId.trim());
  if (p.clinicianId?.trim()) q.set("clinicianId", p.clinicianId.trim());
  if (p.sortBy) q.set("sortBy", p.sortBy);
  if (p.sortOrder) q.set("sortOrder", p.sortOrder);
  return useQuery({
    queryKey: [
      "revenue",
      viewerId,
      from,
      to,
      p.clinicId ?? "",
      p.clinicianId ?? "",
      p.page ?? 1,
      p.pageSize ?? 10,
      p.sortBy,
      p.sortOrder,
    ],
    queryFn: () => apiGet<Paginated<RevenueEntryDto>>(`/api/v1/revenue?${q.toString()}`),
    enabled: enabled && hasToken,
  });
}

export function useRevenueTotalsQuery(params: { from: string; to: string; clinicId?: string; clinicianId?: string }) {
  const hasToken = useHasAuthToken();
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const { from, to } = resolveRevenueRange(params.from, params.to);
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("to", to);
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  if (params.clinicianId?.trim()) q.set("clinicianId", params.clinicianId.trim());
  return useQuery({
    queryKey: ["revenue", "totals", viewerId, from, to, params.clinicId ?? "", params.clinicianId ?? ""],
    queryFn: () => apiGet<RevenueTotalsDto>(`/api/v1/revenue/totals?${q.toString()}`),
    enabled: hasToken,
  });
}

export function useClinicRevenueBreakdownQuery(enabled = true) {
  const { from, to } = useDateRangeStore();
  return useQuery({
    queryKey: ["revenue", "clinic-breakdown", from, to],
    queryFn: () => apiGet<ClinicRevenueBreakdownDto>(`/api/v1/revenue/clinic-breakdown?${rangeQs()}`),
    enabled,
  });
}

export function useAdminAuditLogsQuery(params: { page: number; pageSize: number; q: string; enabled?: boolean }) {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  if (params.q.trim()) q.set("q", params.q.trim());
  return useQuery({
    queryKey: ["admin", "audit-logs", params.page, params.pageSize, params.q.trim()],
    queryFn: () => apiGet<Paginated<AdminAuditLogItemDto>>(`/api/v1/admin/audit-logs?${q.toString()}`),
    enabled: params.enabled ?? true,
  });
}

export function useHrSummaryQuery() {
  return useQuery({
    queryKey: ["hr", "summary"],
    queryFn: () => apiGet<HrSummaryDto>("/api/v1/hr/summary"),
  });
}

export type UnlinkedUserDto = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export function useUnlinkedUsersQuery(search?: string, enabled = true) {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return useQuery({
    queryKey: ["hr", "unlinked-users", search ?? ""],
    queryFn: () => apiGet<UnlinkedUserDto[]>(`/api/v1/hr/unlinked-users${q}`),
    enabled,
  });
}

export interface EmployeesListParams extends PagedRangeParams {
  search?: string;
  clinicId?: string;
  nameFilter?: string;
  clinicFilter?: string;
  recordStatus?: "ACTIVE" | "INACTIVE";
  archived?: boolean;
}

export function useEmployeesQuery(params: EmployeesListParams = {}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  if (params.nameFilter?.trim()) q.set("nameFilter", params.nameFilter.trim());
  if (params.clinicFilter?.trim()) q.set("clinicFilter", params.clinicFilter.trim());
  if (params.recordStatus) q.set("recordStatus", params.recordStatus);
  if (params.archived) q.set("archived", "true");
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: ["hr", "employees", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<EmployeeDto>>(`/api/v1/hr/employees?${q.toString()}`),
  });
}

export function useEmployeeQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["hr", "employee", id],
    queryFn: () => apiGet<EmployeeDto>(`/api/v1/hr/employees/${id}`),
    enabled: Boolean(id),
  });
}

export interface AttendanceListParams extends PagedRangeParams {
  employeeId?: string;
  workDateFrom?: string;
  workDateTo?: string;
  status?: string;
}

export function useAttendanceQuery(params: AttendanceListParams = {}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.employeeId?.trim()) q.set("employeeId", params.employeeId.trim());
  if (params.workDateFrom?.trim()) q.set("workDateFrom", params.workDateFrom.trim());
  if (params.workDateTo?.trim()) q.set("workDateTo", params.workDateTo.trim());
  if (params.status?.trim()) q.set("status", params.status.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: ["hr", "attendance", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<AttendanceDto>>(`/api/v1/hr/attendance?${q.toString()}`),
  });
}

export interface LeaveListParams extends PagedRangeParams {
  employeeId?: string;
  status?: string;
  startFrom?: string;
  startTo?: string;
}

export function useLeaveRequestsQuery(params: LeaveListParams = {}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.employeeId?.trim()) q.set("employeeId", params.employeeId.trim());
  if (params.status?.trim()) q.set("status", params.status.trim());
  if (params.startFrom?.trim()) q.set("startFrom", params.startFrom.trim());
  if (params.startTo?.trim()) q.set("startTo", params.startTo.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: ["hr", "leave", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<LeaveRequestDto>>(`/api/v1/hr/leave-requests?${q.toString()}`),
  });
}

export interface AppointmentsListParams extends PagedRangeParams {
  from?: string;
  to?: string;
  patientMrn?: string;
  patientSearch?: string;
  patientId?: string;
  status?: string;
  clinicId?: string;
  bookableOnly?: boolean;
  enabled?: boolean;
}

export function useAppointmentsQuery(params: AppointmentsListParams = {}) {
  const hasToken = useHasAuthToken();
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  const { enabled = true, bookableOnly, ...rest } = params;
  const q = new URLSearchParams();
  q.set("page", String(rest.page ?? 1));
  q.set("pageSize", String(rest.pageSize ?? 10));
  if (rest.from?.trim()) q.set("from", rest.from.trim());
  if (rest.to?.trim()) q.set("to", rest.to.trim());
  if (rest.patientMrn?.trim()) q.set("patientMrn", rest.patientMrn.trim());
  if (rest.patientSearch?.trim()) q.set("patientSearch", rest.patientSearch.trim());
  if (rest.patientId?.trim()) q.set("patientId", rest.patientId.trim());
  if (rest.status?.trim()) q.set("status", rest.status.trim());
  if (rest.clinicId?.trim()) q.set("clinicId", rest.clinicId.trim());
  if (rest.sortBy) q.set("sortBy", rest.sortBy);
  if (rest.sortOrder) q.set("sortOrder", rest.sortOrder);
  if (bookableOnly) q.set("bookableOnly", "true");
  return useQuery({
    queryKey: ["appointments", viewerId, viewerRole, Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<AppointmentDto>>(`/api/v1/appointments?${q.toString()}`),
    enabled: enabled && hasToken,
  });
}

export function useAppointmentQuery(id: string | undefined) {
  const hasToken = useHasAuthToken();
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  return useQuery({
    queryKey: ["appointment", id, viewerId, viewerRole],
    queryFn: () => apiGet<AppointmentDto>(`/api/v1/appointments/${id}`),
    enabled: Boolean(id) && hasToken,
  });
}

export function useUsersQuery(params: PagedRangeParams & { enabled?: boolean } = {}) {
  const hasToken = useHasAuthToken();
  const { enabled = true, ...p } = params;
  const q = new URLSearchParams();
  q.set("page", String(p.page ?? 1));
  q.set("pageSize", String(p.pageSize ?? 100));
  return useQuery({
    queryKey: ["users", p.page ?? 1, p.pageSize ?? 100],
    queryFn: () => apiGet<Paginated<UserListItemDto>>(`/api/v1/users?${q.toString()}`),
    enabled: enabled && hasToken,
  });
}

export function useAdminOverviewQuery() {
  const hasToken = useHasAuthToken();
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => apiGet<AdminOverviewDto>("/api/v1/admin/overview"),
    enabled: hasToken,
  });
}

export function useReportsMonthlySeriesQuery(from: string, to: string, clinicId?: string) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  const range = sanitizeReportingRange(from, to);
  const q = new URLSearchParams({ from: range.from, to: range.to });
  if (clinicId?.trim()) q.set("clinicId", clinicId.trim());
  return useQuery({
    queryKey: ["reports", "monthly-series", range.from, range.to, clinicId ?? "", viewerId, viewerRole],
    queryFn: () => apiGet<ReportsMonthlySeriesDto>(`/api/v1/reports/monthly-series?${q.toString()}`),
  });
}

export function useReportsPerformanceQuery(from: string, to: string, clinicId?: string) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  const range = sanitizeReportingRange(from, to);
  const q = new URLSearchParams({ from: range.from, to: range.to });
  if (clinicId?.trim()) q.set("clinicId", clinicId.trim());
  return useQuery({
    queryKey: ["reports", "performance", range.from, range.to, clinicId ?? "", viewerId, viewerRole],
    queryFn: () => apiGet<ReportsPerformanceDto>(`/api/v1/reports/performance?${q.toString()}`),
  });
}

export function useReportsClinicBreakdownQuery(from: string, to: string, enabled = true) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const viewerRole = useAuthStore((s) => s.user?.role ?? "");
  const range = sanitizeReportingRange(from, to);
  const q = new URLSearchParams({ from: range.from, to: range.to });
  return useQuery({
    queryKey: ["reports", "clinic-breakdown", range.from, range.to, viewerId, viewerRole],
    enabled,
    queryFn: () => apiGet<ReportsClinicBreakdownDto>(`/api/v1/reports/clinic-breakdown?${q.toString()}`),
  });
}

export function useReportsPatientAcquisitionQuery(from: string, to: string) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const range = sanitizeReportingRange(from, to);
  const q = new URLSearchParams({ from: range.from, to: range.to });
  return useQuery({
    queryKey: ["reports", "patient-acquisition", range.from, range.to, viewerId],
    queryFn: () => apiGet<ReportsPatientAcquisitionDto>(`/api/v1/reports/patient-acquisition?${q.toString()}`),
  });
}

export type PatientAcquisitionPatientsListParams = {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: string;
  mrn?: string;
  name?: string;
  phone?: string;
  branch?: string;
  detail?: string;
};

export function useReportsPatientAcquisitionPatientsQuery(
  channel: string | null,
  from: string,
  to: string,
  params: PatientAcquisitionPatientsListParams,
) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "");
  const range = sanitizeReportingRange(from, to);
  return useQuery({
    queryKey: ["reports", "patient-acquisition", "patients", channel, range.from, range.to, params, viewerId],
    enabled: Boolean(channel),
    queryFn: () => {
      const q = new URLSearchParams({
        channel: channel!,
        from: range.from,
        to: range.to,
        page: String(params.page),
        pageSize: String(params.pageSize),
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      if (params.mrn?.trim()) q.set("mrn", params.mrn.trim());
      if (params.name?.trim()) q.set("name", params.name.trim());
      if (params.phone?.trim()) q.set("phone", params.phone.trim());
      if (params.branch?.trim()) q.set("branch", params.branch.trim());
      if (params.detail?.trim()) q.set("detail", params.detail.trim());
      return apiGet<Paginated<ReportsPatientAcquisitionPatientDto>>(
        `/api/v1/reports/patient-acquisition/patients?${q.toString()}`,
      );
    },
  });
}

export function useTenantsQuery(params: PagedRangeParams & { enabled?: boolean } = {}) {
  const { enabled = true, ...p } = params;
  const q = new URLSearchParams();
  q.set("page", String(p.page ?? 1));
  q.set("pageSize", String(p.pageSize ?? 10));
  if (p.sortBy) q.set("sortBy", p.sortBy);
  if (p.sortOrder) q.set("sortOrder", p.sortOrder);
  return useQuery({
    queryKey: ["admin", "tenants", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<TenantListItemDto>>(`/api/v1/admin/tenants?${q.toString()}`),
    enabled,
  });
}
