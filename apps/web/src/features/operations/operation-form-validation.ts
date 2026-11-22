import type { TFunction } from "i18next";
import type { MedTab } from "@/components/medications-prescription-draft";
import type { PatientAcquisitionChannel } from "@/lib/patient-acquisition";

export type OperationAcquisitionFormValues = {
  channel: PatientAcquisitionChannel | "";
  referralName: string;
  otherDetail: string;
};

function validatePatientAcquisitionRequired(
  values: OperationAcquisitionFormValues,
  t: TFunction,
): string | null {
  if (!values.channel) {
    return t("operations.errorAcquisitionRequired", "Select how the patient found the clinic.");
  }
  return validatePatientAcquisitionDetails(values, t);
}

/** When acquisition is optional, still validate referral/other details if a channel is chosen. */
function validatePatientAcquisitionDetails(
  values: OperationAcquisitionFormValues,
  t: TFunction,
): string | null {
  if (
    (values.channel === "DOCTOR_REFERRAL" || values.channel === "ANOTHER_PATIENT") &&
    !values.referralName.trim()
  ) {
    return t("patients.errorExplainMoreRequired", "Explain more is required.");
  }
  if (values.channel === "OTHER" && !values.otherDetail.trim()) {
    return t("patients.errorExplainMoreRequired", "Explain more is required.");
  }
  return null;
}
import { type PendingDocumentRow } from "@/components/pending-document-utils";
import { collectPendingDocumentFieldErrors, pendingDocumentValidationMessage } from "@/components/pending-document-utils";

export { errorToValidationIssues } from "@/lib/form-validation";

export type OperationCreateValidationInput = {
  patientId: string;
  clinicianId: string;
  operationDate: string;
  totalCost: string;
  downPayment: string;
  /** When true, total cost may be omitted (e.g. call center booking). */
  feesOptional?: boolean;
  /** Contract / تعاقد — required when fee editors set total to 0. */
  isContract?: boolean;
  docRows: PendingDocumentRow[];
  /** Categories already present on the saved operation. */
  reservedDocCategories?: readonly string[];
  medTab: MedTab;
  prescriptionFile: File | null;
  generatedPrescriptionFile: File | null;
  hasExistingPrescription?: boolean;
  acquisition: OperationAcquisitionFormValues;
  /** When false, skip acquisition (e.g. scheduled operation edit). */
  requireAcquisition?: boolean;
};

export { isZeroCostWithoutContract } from "./operation-contract-cost";

export type OperationCreateValidationResult = {
  issues: string[];
  invalidDocRowIds: Set<string>;
};

export function collectOperationCreateValidationIssues(
  input: OperationCreateValidationInput,
  t: TFunction,
): OperationCreateValidationResult {
  const issues: string[] = [];
  let invalidDocRowIds = new Set<string>();

  if (!input.patientId.trim()) {
    issues.push(t("operations.errorPatientRequired", "Select a patient."));
  }
  if (!input.clinicianId.trim()) {
    issues.push(t("operations.errorDoctorRequired", "Select the performing doctor."));
  }
  if (!input.operationDate.trim()) {
    issues.push(t("operations.errorDateRequired", "Enter the operation date and time."));
  } else {
    const d = new Date(input.operationDate);
    if (Number.isNaN(d.getTime())) {
      issues.push(t("operations.errorDateInvalid", "Enter a valid operation date and time."));
    }
  }
  if (!input.feesOptional) {
    if (!input.totalCost.trim()) {
      issues.push(
        t(
          "operations.errorTotalRequired",
          "Enter the total cost or check if the operation is contract.",
        ),
      );
    } else {
      const total = Number.parseFloat(input.totalCost);
      if (Number.isNaN(total)) {
        issues.push(t("operations.errorTotalInvalid", "Enter a valid total cost amount."));
      } else if (total < 0) {
        issues.push(t("operations.errorTotalNegative", "Total cost cannot be negative."));
      } else if (total === 0 && !input.isContract) {
        issues.push(
          t(
            "operations.errorContractRequiredForZero",
            "Enter the total cost or check if the operation is contract.",
          ),
        );
      }
    }
  } else if (input.totalCost.trim()) {
    const total = Number.parseFloat(input.totalCost);
    if (Number.isNaN(total)) {
      issues.push(t("operations.errorTotalInvalid", "Enter a valid total cost amount."));
    } else if (total < 0) {
      issues.push(t("operations.errorTotalNegative", "Total cost cannot be negative."));
    }
  }
  if (input.feesOptional && input.downPayment.trim()) {
    issues.push(
      t("operations.errorDownNotAllowed", "Down payment is recorded later by clinic staff for your role."),
    );
  }
  if (!input.feesOptional && input.downPayment.trim()) {
    const down = Number.parseFloat(input.downPayment);
    if (Number.isNaN(down)) {
      issues.push(t("operations.errorDownInvalid", "Enter a valid down payment amount."));
    } else if (down < 0) {
      issues.push(t("operations.errorDownNegative", "Down payment cannot be negative."));
    }
  }

  const docValidation = collectPendingDocumentFieldErrors(input.docRows, {
    uniqueCategories: true,
    reservedCategories: input.reservedDocCategories,
  });
  const docMsg = pendingDocumentValidationMessage(docValidation.code, t);
  if (docMsg) {
    issues.push(docMsg);
    invalidDocRowIds = docValidation.invalidRowIds;
  }

  if (input.medTab === "prescription" && !input.prescriptionFile && !input.generatedPrescriptionFile && !input.hasExistingPrescription) {
    issues.push(
      t(
        "operations.errorPrescriptionRequired",
        "Upload a prescription or generate one from manual medications.",
      ),
    );
  }

  if (input.requireAcquisition) {
    const acquisitionErr = validatePatientAcquisitionRequired(input.acquisition, t);
    if (acquisitionErr) issues.push(acquisitionErr);
  } else if (input.acquisition.channel) {
    const detailErr = validatePatientAcquisitionDetails(input.acquisition, t);
    if (detailErr) issues.push(detailErr);
  }

  return { issues, invalidDocRowIds };
}
