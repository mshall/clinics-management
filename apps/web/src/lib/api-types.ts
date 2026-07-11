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
  kind: "LAB" | "RADIOLOGY" | "PRESCRIPTION";
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface EncounterDetailDto {
  id: string;
  clinicId: string;
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  patientId: string;
  patientMrn?: string | null;
  patientName?: string | null;
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
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  category: string;
  description: string | null;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  currency: string;
  postedAt: string;
  status: string;
}

export interface EmployeeEmploymentPeriodDto {
  id: string;
  startDate: string;
  endDate: string | null;
  separationReason: string | null;
}

export interface EmployeeDto {
  id: string;
  clinicId: string;
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  hasIdDoc?: boolean;
  employeeNumber: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
  email: string | null;
  phone: string;
  jobTitle: string;
  employmentType: string;
  hireDate: string;
  salaryBase: number;
  userId: string | null;
  linkedUserDisplayName?: string | null;
  linkedUserRole?: string | null;
  linkedUserClinicIds?: string[];
  hasUserAvatar?: boolean;
  recordStatus: "ACTIVE" | "INACTIVE";
  resignationDate: string | null;
  separationReason: string | null;
  employmentPeriods: EmployeeEmploymentPeriodDto[];
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeNumber?: string | null;
  employeeFullName?: string | null;
  employeeFirstNameEn?: string | null;
  employeeLastNameEn?: string | null;
  employeeFirstNameAr?: string | null;
  employeeLastNameAr?: string | null;
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
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  patientId: string;
  clinicianId: string;
  /** Employee first/last when linked, else user displayName */
  clinicianName?: string | null;
  clinicianFirstNameEn?: string | null;
  clinicianLastNameEn?: string | null;
  clinicianFirstNameAr?: string | null;
  clinicianLastNameAr?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  patientMrn?: string | null;
  patientName?: string | null;
}

export interface OperationDto {
  id: string;
  clinicId: string;
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  patientId: string;
  patientMrn?: string | null;
  patientName?: string | null;
  clinicianId: string;
  clinicianName?: string | null;
  clinicianFirstNameEn?: string | null;
  clinicianLastNameEn?: string | null;
  clinicianFirstNameAr?: string | null;
  clinicianLastNameAr?: string | null;
  operationDate: string;
  totalCost: number;
  downPayment: number;
  paidAmount: number;
  balanceDue: number;
  comments: string | null;
  status: string;
  createdAt: string;
}

export interface OperationMedicationDto {
  id: string;
  drugName: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
}

export interface OperationDocumentDto {
  id: string;
  kind: string;
  description: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface OperationDetailDto extends OperationDto {
  noMedications: boolean;
  medications: OperationMedicationDto[];
  documents: OperationDocumentDto[];
}

export interface ClinicPhysicianDto {
  userId: string;
  displayName: string;
  email: string | null;
  employeeId: string;
  jobTitle: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
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

export interface ClinicDetailDto {
  id: string;
  parentClinicId: string | null;
  parentNameEn: string | null;
  parentNameAr: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: "parent" | "branch" | "standalone";
  logoUrl: string | null;
  addressEn: string;
  addressAr: string;
  locationUrl: string;
  phone: string;
  email: string;
  licenseNumber: string;
  defaultLanguage: string;
  defaultCurrency: string;
}

export interface AdminAuditLogItemDto {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  clinicId: string | null;
  createdAt: string;
  actorDisplayName: string | null;
  actorEmail: string | null;
  actorRole?: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ClinicRevenueBreakdownDto {
  items: Array<{
    clinicId: string;
    nameEn: string;
    nameAr: string;
    grossTotal: number;
    netTotal: number;
    taxTotal: number;
  }>;
  grandGross: number;
  grandNet: number;
}

export interface ReportsMonthlySeriesItemDto {
  month: string;
  monthStart: string;
  visits: number;
  revenue: number;
  newPatients: number;
}

export interface ReportsMonthlySeriesDto {
  months: number;
  items: ReportsMonthlySeriesItemDto[];
}

export interface ReportsPatientAcquisitionItemDto {
  channel: string;
  count: number;
  sharePercent: number;
}

export interface ReportsPatientAcquisitionDto {
  period: {
    from: string;
    to: string;
    start: string;
    end: string;
  };
  total: number;
  items: ReportsPatientAcquisitionItemDto[];
}

export interface ReportsPatientAcquisitionPatientDto {
  id: string;
  mrn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  phone: string;
  email: string | null;
  dob: string | null;
  gender: string;
  homeBranch: string | null;
  acquisitionChannel: string | null;
  acquisitionReferralName: string | null;
  acquisitionOtherDetail: string | null;
  createdAt: string;
}
