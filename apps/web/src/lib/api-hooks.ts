import { useQuery } from "@tanstack/react-query";
import type { ClinicDto, GroupOverviewKpisDto, PatientDto } from "@/lib/api-schema";
import type {
  AdminOverviewDto,
  AppointmentDto,
  RevenueTotalsDto,
  AttendanceDto,
  EmployeeDto,
  EncounterDetailDto,
  EncounterDocumentDto,
  EncounterMedicationDto,
  ExpenseDto,
  HrSummaryDto,
  LeaveRequestDto,
  RevenueEntryDto,
  TenantListItemDto,
  UserListItemDto,
} from "@/lib/api-types";
import { apiGet } from "@/lib/http";
import type { Paginated } from "@/lib/paginated";
import { useDateRangeStore } from "@/stores/date-range-store";

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
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("to", to);
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

export function usePatientsQuery(params: PatientsListParams) {
  const { enabled = true, ...listParams } = params;
  const q = patientsQs(listParams);
  return useQuery({
    queryKey: ["patients", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<PatientDto>>(`/api/v1/patients?${q.toString()}`),
    enabled,
  });
}

export function usePatientQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["patient", id],
    queryFn: () => apiGet<PatientDto>(`/api/v1/patients/${id}`),
    enabled: Boolean(id),
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

export function useClinicsQuery() {
  return useQuery({
    queryKey: ["clinics"],
    queryFn: () => apiGet<ClinicDto[]>("/api/v1/clinics"),
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
  const storeFrom = useDateRangeStore((s) => s.from);
  const storeTo = useDateRangeStore((s) => s.to);
  const from = params.from ?? storeFrom;
  const to = params.to ?? storeTo;
  const patientChart = Boolean(params.patientId?.trim());
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
  const enabled = params.enabled !== false;
  return useQuery({
    queryKey: patientChart
      ? [
          "encounters",
          "patient",
          params.patientId!.trim(),
          params.page ?? 1,
          params.pageSize ?? 10,
          params.sortBy ?? "createdAt",
          params.sortOrder ?? "desc",
        ]
      : [
          "encounters",
          "ledger",
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
  });
}

export function useEncounterQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["encounter", id],
    queryFn: () => apiGet<EncounterDetailDto>(`/api/v1/encounters/${id}`),
    enabled: Boolean(id),
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

export interface RevenueListParams {
  from: string;
  to: string;
  clinicId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function useRevenueQuery(params: RevenueListParams) {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: [
      "revenue",
      params.from,
      params.to,
      params.clinicId ?? "",
      params.page ?? 1,
      params.pageSize ?? 10,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: () => apiGet<Paginated<RevenueEntryDto>>(`/api/v1/revenue?${q.toString()}`),
  });
}

export function useRevenueTotalsQuery(params: { from: string; to: string; clinicId?: string }) {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  return useQuery({
    queryKey: ["revenue", "totals", params.from, params.to, params.clinicId ?? ""],
    queryFn: () => apiGet<RevenueTotalsDto>(`/api/v1/revenue/totals?${q.toString()}`),
  });
}

export function useHrSummaryQuery() {
  return useQuery({
    queryKey: ["hr", "summary"],
    queryFn: () => apiGet<HrSummaryDto>("/api/v1/hr/summary"),
  });
}

export interface EmployeesListParams extends PagedRangeParams {
  search?: string;
  clinicId?: string;
  nameFilter?: string;
  clinicFilter?: string;
}

export function useEmployeesQuery(params: EmployeesListParams = {}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.clinicId?.trim()) q.set("clinicId", params.clinicId.trim());
  if (params.nameFilter?.trim()) q.set("nameFilter", params.nameFilter.trim());
  if (params.clinicFilter?.trim()) q.set("clinicFilter", params.clinicFilter.trim());
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
    queryKey: ["appointments", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<AppointmentDto>>(`/api/v1/appointments?${q.toString()}`),
    enabled,
  });
}

export function useAppointmentQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["appointment", id],
    queryFn: () => apiGet<AppointmentDto>(`/api/v1/appointments/${id}`),
    enabled: Boolean(id),
  });
}

export function useUsersQuery(params: PagedRangeParams = {}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 100));
  return useQuery({
    queryKey: ["users", params.page ?? 1, params.pageSize ?? 100],
    queryFn: () => apiGet<Paginated<UserListItemDto>>(`/api/v1/users?${q.toString()}`),
  });
}

export function useAdminOverviewQuery() {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => apiGet<AdminOverviewDto>("/api/v1/admin/overview"),
  });
}

export function useTenantsQuery(params: PagedRangeParams = {}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 10));
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return useQuery({
    queryKey: ["admin", "tenants", Object.fromEntries(q.entries())],
    queryFn: () => apiGet<Paginated<TenantListItemDto>>(`/api/v1/admin/tenants?${q.toString()}`),
  });
}
