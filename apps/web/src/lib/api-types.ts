/** API shapes not yet in OpenAPI codegen — keep aligned with Nest DTOs. */

export type GenderCode = "M" | "F" | "OTHER" | "UNKNOWN";

export interface DiagnosisDto {
  id: string;
  icd10Code: string;
  descriptionEn: string;
  descriptionAr: string | null;
  isPrimary: boolean;
}

export interface EncounterMedicationDto {
  id: string;
  drugName: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
}

export interface EncounterDocumentDto {
  id: string;
  kind: "LAB" | "RADIOLOGY";
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface EncounterDetailDto {
  id: string;
  clinicId: string;
  patientId: string;
  clinicianId: string;
  status: string;
  visitType: string;
  chiefComplaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  vitalsJson: Record<string, unknown> | null;
  heartRate: number | null;
  spo2: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  temperature: number | null;
  weightKg: number | null;
  heightCm: number | null;
  noMedications: boolean;
  visitFeeAmount: number;
  appointmentId?: string | null;
  finalizedAt: string | null;
  diagnoses: DiagnosisDto[];
  medications: EncounterMedicationDto[];
  documents: EncounterDocumentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseDto {
  id: string;
  clinicId: string;
  category: string;
  vendorName: string | null;
  amount: number;
  currency: string;
  incurredAt: string;
  status: string;
  hasProof: boolean;
  proofOriginalName: string | null;
}

export interface RevenueEntryDto {
  id: string;
  clinicId: string;
  category: string;
  description: string | null;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  currency: string;
  postedAt: string;
  status: string;
}

export interface EmployeeDto {
  id: string;
  clinicId: string;
  clinicNameEn?: string | null;
  hasIdDoc?: boolean;
  employeeNumber: string;
  firstNameEn: string;
  lastNameEn: string;
  email: string | null;
  phone: string;
  jobTitle: string;
  employmentType: string;
  hireDate: string;
  salaryBase: number;
  userId: string | null;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeNumber?: string | null;
  employeeFullName?: string | null;
  clinicNameEn?: string | null;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  notes: string | null;
}

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
}

export interface AppointmentDto {
  id: string;
  clinicId: string;
  patientId: string;
  clinicianId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  patientMrn?: string | null;
  patientName?: string | null;
}

export interface HrSummaryDto {
  employeeCount: number;
  monthlyPayrollEstimate: number;
  pendingLeaveRequests: number;
}

export interface ProfitLossDto {
  period: { from: string; to: string; start: string; end: string };
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface RevenueTotalsDto {
  grossTotal: number;
  netTotal: number;
}

export interface AdminOverviewDto {
  currentTenant: { id: string; name: string; baseCurrency: string; defaultVisitFee: number } | null;
  registeredTenants: number;
  featureFlags: Array<{ id: string; key: string; enabled: boolean; description: string | null }>;
  recentAudit: Array<{ id: string; action: string; resource: string; resourceId: string | null; createdAt: string }>;
}

export interface TenantListItemDto {
  id: string;
  name: string;
  baseCurrency: string;
  defaultLocale: string;
  createdAt: string;
  counts: { users: number; clinics: number; patients: number };
}

export interface UserListItemDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
}
