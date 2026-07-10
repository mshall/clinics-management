import type { TFunction } from "i18next";
import {
  collectPendingDocumentFieldErrors,
  pendingDocumentValidationMessage,
  type PendingDocumentRow,
} from "@/components/pending-document-attachments";
import { validatePatientAcquisitionForm, type PatientAcquisitionFormValues } from "@/components/patient-acquisition-fields";
import type { ClinicFormValues } from "@/features/clinics/clinic-form-utils";
import { collectClinicFormErrors } from "@/features/clinics/clinic-form-utils";
import { getOrgUserCreateMissingLabels } from "@/features/platform/org-user-form-validation";
import type { OrgUserCreateFormInput } from "@/features/platform/platform-shared";
import {
  collectPatientDemographicsValidationIssues,
  type PatientDemographicsFormValues,
} from "@/lib/patient-form-utils";

export function collectAppointmentCreateIssues(
  input: {
    clinicId: string;
    patientId: string;
    clinicianId: string;
    start: string;
    end: string;
  },
  t: TFunction,
): string[] {
  const issues: string[] = [];
  if (!input.clinicId.trim()) issues.push(t("appointments.errorClinicRequired", "Select a clinic."));
  if (!input.patientId.trim()) issues.push(t("appointments.errorPatientRequired", "Select a patient."));
  if (!input.clinicianId.trim()) issues.push(t("appointments.errorClinicianRequired", "Select a clinician."));
  if (!input.start.trim() || !input.end.trim()) {
    issues.push(t("appointments.errorTimesRequired", "Start and end date/time are required."));
  } else if (new Date(input.end).getTime() <= new Date(input.start).getTime()) {
    issues.push(t("appointments.errorEndAfterStart", "End time must be after start time."));
  }
  return issues;
}

export function collectExpenseSubmitIssues(
  input: { clinicId: string; amount: string; proofFile: File | null },
  t: TFunction,
): string[] {
  const issues: string[] = [];
  if (!input.clinicId.trim()) issues.push(t("expenses.errorClinicRequired", "Select a clinic."));
  if (!input.amount.trim()) {
    issues.push(t("expenses.errorAmountRequired", "Enter an amount."));
  } else if (Number.isNaN(Number.parseFloat(input.amount))) {
    issues.push(t("expenses.errorAmountInvalid", "Enter a valid amount."));
  }
  if (input.proofFile && input.proofFile.size > 15 * 1024 * 1024) {
    issues.push(t("expenses.proofTooLarge", "File is too large (max 15 MB)."));
  }
  return issues;
}

export function collectRevenueSubmitIssues(
  input: {
    clinicId: string;
    operationId: string;
    operationClinicId?: string;
    gross: string;
    paymentExceedsBalance: boolean;
  },
  t: TFunction,
): string[] {
  const issues: string[] = [];
  const effectiveClinicId = input.operationId ? input.operationClinicId : input.clinicId;
  if (!effectiveClinicId?.trim()) {
    issues.push(t("revenue.errorClinicRequired", "Select a clinic or operation."));
  }
  if (!input.gross.trim()) {
    issues.push(t("revenue.errorAmountRequired", "Enter a gross amount."));
  } else if (Number.isNaN(Number.parseFloat(input.gross))) {
    issues.push(t("revenue.errorAmountInvalid", "Enter a valid gross amount."));
  }
  if (input.paymentExceedsBalance) {
    issues.push(t("revenue.errorPaymentExceedsBalance", "Payment exceeds the operation balance due."));
  }
  return issues;
}

export function collectEmployeeCreateIssues(
  input: {
    clinicId: string;
    firstName: string;
    lastName: string;
    phone: string;
    salary: string;
  },
  t: TFunction,
): string[] {
  const issues: string[] = [];
  if (!input.clinicId.trim()) issues.push(t("hr.errorClinicRequired", "Select a clinic."));
  if (!input.firstName.trim()) issues.push(t("hr.errorFirstNameRequired", "First name is required."));
  if (!input.lastName.trim()) issues.push(t("hr.errorLastNameRequired", "Last name is required."));
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 8) issues.push(t("hr.errorPhoneRequired", "Enter a valid phone number (at least 8 digits)."));
  if (!input.salary.trim()) {
    issues.push(t("hr.errorSalaryRequired", "Enter a base salary."));
  } else if (Number.isNaN(Number.parseFloat(input.salary))) {
    issues.push(t("hr.errorSalaryInvalid", "Enter a valid salary amount."));
  }
  return issues;
}

export function collectAttendanceCreateIssues(input: { employeeId: string }, t: TFunction): string[] {
  if (!input.employeeId.trim()) return [t("hr.errorEmployeeRequired", "Select an employee.")];
  return [];
}

export function collectLeaveCreateIssues(input: { employeeId: string }, t: TFunction): string[] {
  if (!input.employeeId.trim()) return [t("hr.errorEmployeeRequired", "Select an employee.")];
  return [];
}

export function collectEncounterCreateIssues(
  input: {
    patientRegistryTotal: number;
    patientId: string;
    clinicianId: string;
    clinicId: string;
    visitType: string;
    isPhysician: boolean;
    acquisition: PatientAcquisitionFormValues;
  },
  t: TFunction,
): string[] {
  const issues: string[] = [];
  if (input.patientRegistryTotal === 0) {
    issues.push(t("encounters.noPatientsRegistered", "Register a patient before creating encounters."));
  }
  if (!input.patientId.trim()) issues.push(t("encounters.errorPatientRequired", "Select a patient."));
  if (!input.isPhysician && !input.clinicianId.trim()) {
    issues.push(t("encounters.errorClinicianRequired", "Select the attending physician."));
  }
  if (!input.clinicId.trim()) issues.push(t("encounters.errorClinicRequired", "Select a clinic."));
  if (!input.visitType.trim()) issues.push(t("encounters.errorVisitTypeRequired", "Select a visit type."));
  const acquisitionError = validatePatientAcquisitionForm(input.acquisition, t);
  if (acquisitionError) issues.push(acquisitionError);
  return issues;
}

export function collectClinicDoctorAssignIssues(input: { userId: string }, t: TFunction): string[] {
  if (!input.userId.trim()) return [t("clinics.errorDoctorRequired", "Select a physician to assign.")];
  return [];
}

export function collectQuickEncounterIssues(input: { clinicId: string }, t: TFunction): string[] {
  if (!input.clinicId.trim()) {
    return [t("encounters.errorClinicRequired", "Patient needs a home branch or an active clinic to create an encounter.")];
  }
  return [];
}

export function collectOrgUserCreateIssues(
  values: OrgUserCreateFormInput,
  t: TFunction,
  opts?: { requireTenant?: boolean },
): string[] {
  return getOrgUserCreateMissingLabels(values, t, opts);
}

export function collectClinicFormIssues(
  form: ClinicFormValues,
  t: TFunction,
  opts?: { tenantId?: string; requireTenant?: boolean },
): string[] {
  return collectClinicFormErrors(form, t, opts);
}

export function collectOrgSettingsIssues(
  input: { tenantId: string; nameEn: string },
  t: TFunction,
): string[] {
  const issues: string[] = [];
  if (!input.tenantId.trim()) issues.push(t("platform.errorOrgNotSelected", "No organization selected."));
  if (!input.nameEn.trim()) issues.push(t("platform.errorOrgNameEn", "Organization name (English) is required."));
  return issues;
}

export type PatientRegisterValidationInput = PatientDemographicsFormValues & {
  docRows: PendingDocumentRow[];
};

export function collectPatientRegisterValidationIssues(
  input: PatientRegisterValidationInput,
  t: TFunction,
): { issues: string[]; invalidDocRowIds: Set<string> } {
  const issues = collectPatientDemographicsValidationIssues(input, t);
  let invalidDocRowIds = new Set<string>();

  const docValidation = collectPendingDocumentFieldErrors(input.docRows);
  const docMsg = pendingDocumentValidationMessage(docValidation.code, t);
  if (docMsg) {
    issues.push(docMsg);
    invalidDocRowIds = docValidation.invalidRowIds;
  }

  return { issues, invalidDocRowIds };
}
