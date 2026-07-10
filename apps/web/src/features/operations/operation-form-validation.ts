import type { TFunction } from "i18next";
import type { MedTab } from "@/components/medications-prescription-draft-panel";
import {
  collectPendingDocumentFieldErrors,
  pendingDocumentValidationMessage,
  type PendingDocumentRow,
} from "@/components/pending-document-attachments";
import { ApiError } from "@/lib/http";

export type OperationCreateValidationInput = {
  patientId: string;
  clinicianId: string;
  operationDate: string;
  totalCost: string;
  downPayment: string;
  docRows: PendingDocumentRow[];
  medTab: MedTab;
  prescriptionFile: File | null;
  generatedPrescriptionFile: File | null;
};

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
  if (!input.totalCost.trim()) {
    issues.push(t("operations.errorTotalRequired", "Enter the total cost."));
  } else {
    const total = Number.parseFloat(input.totalCost);
    if (Number.isNaN(total)) {
      issues.push(t("operations.errorTotalInvalid", "Enter a valid total cost amount."));
    } else if (total < 0) {
      issues.push(t("operations.errorTotalNegative", "Total cost cannot be negative."));
    }
  }
  if (input.downPayment.trim()) {
    const down = Number.parseFloat(input.downPayment);
    if (Number.isNaN(down)) {
      issues.push(t("operations.errorDownInvalid", "Enter a valid down payment amount."));
    } else if (down < 0) {
      issues.push(t("operations.errorDownNegative", "Down payment cannot be negative."));
    }
  }

  const docValidation = collectPendingDocumentFieldErrors(input.docRows);
  const docMsg = pendingDocumentValidationMessage(docValidation.code, t);
  if (docMsg) {
    issues.push(docMsg);
    invalidDocRowIds = docValidation.invalidRowIds;
  }

  if (input.medTab === "prescription" && !input.prescriptionFile && !input.generatedPrescriptionFile) {
    issues.push(
      t(
        "operations.errorPrescriptionRequired",
        "Upload a prescription or generate one from manual medications.",
      ),
    );
  }

  return { issues, invalidDocRowIds };
}

export function errorToValidationIssues(error: unknown): string[] {
  if (error instanceof ApiError) {
    const msg = error.message.trim();
    if (!msg) return [error.message];
    if (msg.includes("; ")) return msg.split("; ").map((part) => part.trim()).filter(Boolean);
    return [msg];
  }
  if (error instanceof Error) {
    const msg = error.message.trim();
    return msg ? [msg] : [String(error)];
  }
  return [String(error)];
}
