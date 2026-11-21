import type { TFunction } from "i18next";
import i18n from "@/lib/i18n";
import { ApiError } from "@/lib/http";

type ErrorBody = {
  message?: unknown;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  error?: unknown;
  statusCode?: number;
};

function rawMessageFromBody(status: number, body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as ErrorBody;
    if (Array.isArray(o.message)) return o.message.map((x) => String(x)).join("; ");
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (status === 503 && typeof o.error === "string") {
      return `${o.error}. ${typeof o.message === "string" ? o.message : fallback}`;
    }
  }
  return fallback;
}

const MESSAGE_PATTERNS: { re: RegExp; key: string; params?: (m: RegExpMatchArray) => Record<string, unknown> }[] = [
  { re: /^File too large \(max (\d+)MB\)$/i, key: "errors.upload.fileTooLarge", params: (m) => ({ maxMb: Number(m[1]) }) },
  { re: /^File is required\.?$/i, key: "errors.upload.fileRequired" },
  { re: /^A file is required/i, key: "errors.upload.fileRequired" },
  { re: /^Missing file$/i, key: "errors.upload.fileRequired" },
  { re: /^Document description is required/i, key: "errors.upload.descriptionRequired" },
  { re: /^Unsupported file type: (.+)$/i, key: "errors.upload.unsupportedType", params: (m) => ({ mime: m[1] }) },
  { re: /^Only image documents can be cropped/i, key: "errors.upload.imagesOnly" },
  { re: /^Payload Too Large/i, key: "errors.upload.fileTooLarge", params: () => ({ maxMb: 15 }) },
  { re: /^NetworkError|Failed to fetch|Load failed/i, key: "errors.network" },
  { re: /^Request failed$/i, key: "errors.requestFailed" },

  // Appointments
  { re: /^Invalid startsAt$/i, key: "errors.appointments.invalidStartsAt" },
  { re: /^endsAt must be after startsAt$/i, key: "errors.appointments.endsAfterStarts" },
  { re: /^Cannot cancel a completed appointment$/i, key: "errors.appointments.cannotCancelCompleted" },
  { re: /^Cannot change status of a completed appointment$/i, key: "errors.appointments.cannotChangeCompletedStatus" },
  { re: /^This appointment is read-only \(completed\)$/i, key: "errors.appointments.readOnlyCompleted" },
  { re: /^Physicians may only book appointments as themselves$/i, key: "errors.appointments.physiciansSelfOnly" },
  { re: /^Invalid clinic, patient, or clinician$/i, key: "errors.appointments.invalidClinicPatientClinician" },
  { re: /^You can only access appointments where you are the clinician$/i, key: "errors.appointments.clinicianOnly" },
  { re: /^This appointment is outside your assigned clinics$/i, key: "errors.appointments.outsideClinicScope" },
  { re: /^feeAmount must be a non-negative number$/i, key: "errors.appointments.feeNonNegative" },
  { re: /^Tenant not found$/i, key: "errors.appointments.tenantNotFound" },

  // Encounters
  { re: /^Encounter is finalized and cannot be edited$/i, key: "errors.encounters.finalizedLocked" },
  { re: /^Already finalized$/i, key: "errors.encounters.alreadyFinalized" },
  { re: /^Only finalized encounters can be amended$/i, key: "errors.encounters.amendFinalizedOnly" },
  { re: /^Amend reason is required$/i, key: "errors.encounters.amendReasonRequired" },
  { re: /^Only the assigned clinician can finalize this encounter$/i, key: "errors.encounters.finalizeAssignedOnly" },
  { re: /^Only the assigned clinician or a supervisor can amend a signed note$/i, key: "errors.encounters.amendAssignedOrSupervisor" },
  { re: /^You can only (work on|open) encounters assigned to you$/i, key: "errors.encounters.assignedOnly" },
  { re: /^clinicianId is required/i, key: "errors.encounters.clinicianRequired" },
  { re: /^Invalid clinicId$/i, key: "errors.encounters.invalidClinic" },
  { re: /^Invalid patientId$/i, key: "errors.encounters.invalidPatient" },
  { re: /^Appointment not found for this patient$/i, key: "errors.encounters.appointmentNotFound" },
  { re: /^This appointment cannot be linked to a new encounter$/i, key: "errors.encounters.appointmentNotLinkable" },
  { re: /^An open encounter is already linked to this appointment$/i, key: "errors.encounters.appointmentAlreadyLinked" },
  { re: /^Lab and radiology uploads require a draft, amended, or finalized encounter$/i, key: "errors.encounters.labUploadStatus" },
  { re: /^kind must be LAB, RADIOLOGY, or PRESCRIPTION$/i, key: "errors.encounters.invalidDocumentKind" },
  { re: /^visitFeeAmount must be a non-negative number$/i, key: "errors.encounters.visitFeeNonNegative" },
  { re: /^You do not have permission to edit encounter visit fees$/i, key: "errors.encounters.visitFeePermission" },
  { re: /^Drug product not found in market catalog$/i, key: "errors.encounters.drugNotFound" },
  { re: /^Remove medications\/prescription or disable "no medications prescribed"$/i, key: "errors.encounters.medsConflict" },
  { re: /^Invalid visit fee currency$/i, key: "errors.encounters.invalidFeeCurrency" },

  // Operations
  { re: /^Only booked or pre-op operations can be edited$/i, key: "errors.operations.editableStatusOnly" },
  { re: /^Post-surgery documents can only be added to discharged operations$/i, key: "errors.operations.postSurgeryDischargedOnly" },
  { re: /^This document kind cannot be uploaded through this endpoint$/i, key: "errors.operations.documentKindNotAllowed" },
  { re: /^kind must be ATTACHMENT, PRESCRIPTION, CONSENT, OPERATION_NOTE, or POST_SURGERY$/i, key: "errors.operations.invalidDocumentKind" },
  { re: /^Invalid fee currency$/i, key: "errors.operations.invalidFeeCurrency" },
  { re: /^Invalid operation date$/i, key: "errors.operations.invalidDate" },
  { re: /^Down payment cannot exceed total cost$/i, key: "errors.operations.downExceedsTotal" },
  { re: /^Paid amount cannot exceed total cost$/i, key: "errors.operations.paidExceedsTotal" },
  { re: /^Paid amount cannot be negative$/i, key: "errors.operations.paidNegative" },
  { re: /^Clinician must be a physician in your organization$/i, key: "errors.operations.clinicianMustBePhysician" },
  { re: /^No clinic available for this operation$/i, key: "errors.operations.noClinic" },
  { re: /^Clinic not found$/i, key: "errors.operations.clinicNotFound" },
  { re: /^Clinic is outside your assigned scope$/i, key: "errors.operations.clinicOutsideScope" },
  { re: /^You can only manage operations assigned to you$/i, key: "errors.operations.assignedOnly" },
  { re: /^This operation is outside your assigned clinics$/i, key: "errors.operations.outsideClinicScope" },
  { re: /^You do not have permission to edit operation fees$/i, key: "errors.operations.feePermission" },
  { re: /^Cancelled operations cannot be edited$/i, key: "errors.operations.cancelledNotEditable" },
  { re: /^Only administrators can edit completed operations$/i, key: "errors.operations.completedAdminOnly" },
  { re: /^Operation total cost must be greater than zero$/i, key: "errors.operations.totalMustBePositive" },
  { re: /^Operation total cost must be greater than zero to complete$/i, key: "errors.operations.totalMustBePositiveToComplete" },
  { re: /^Collect the remaining balance before completing this operation$/i, key: "errors.operations.collectBalanceBeforeComplete" },
  { re: /^Cannot cancel a completed operation$/i, key: "errors.operations.cannotCancelCompleted" },
  { re: /^Cannot change status of a completed or cancelled operation$/i, key: "errors.operations.cannotChangeTerminalStatus" },
  { re: /^Invalid status transition$/i, key: "errors.operations.invalidStatusTransition" },
  { re: /^Advance one stage at a time/i, key: "errors.operations.advanceOneStage" },
  { re: /^Record a down payment before advancing the operation to in progress$/i, key: "errors.operations.downPaymentBeforeInProgress" },
  { re: /^You do not have permission to mark operations as completed$/i, key: "errors.operations.completePermission" },
  { re: /^You do not have permission to update operation clinical details$/i, key: "errors.operations.clinicalUpdatePermission" },
  { re: /^You do not have permission to update this operation$/i, key: "errors.operations.updatePermission" },
  { re: /^Invalid clinic, patient, or clinician$/i, key: "errors.operations.invalidClinicPatientClinician" },
  { re: /^Operation not found$/i, key: "errors.operations.notFound" },
  { re: /^patientId, clinicianId, and operationDate are required$/i, key: "errors.operations.createFieldsRequired" },
];

export function localizeApiErrorMessage(
  status: number,
  body: unknown,
  fallback: string,
  t: TFunction = i18n.t.bind(i18n),
): string {
  if (body && typeof body === "object") {
    const o = body as ErrorBody;
    if (typeof o.messageKey === "string" && o.messageKey.trim()) {
      const params = (o.messageParams ?? {}) as Record<string, string | number>;
      const translated = t(o.messageKey, rawMessageFromBody(status, body, fallback), params);
      if (translated && translated !== o.messageKey) return translated;
    }
  }

  const raw = rawMessageFromBody(status, body, fallback);
  for (const { re, key, params } of MESSAGE_PATTERNS) {
    const m = raw.match(re);
    if (m) return t(key, raw, params?.(m) ?? {});
  }

  if (status === 401) return t("errors.unauthorized", "Your session expired. Please sign in again.");
  if (status === 403) return t("errors.forbidden", "You do not have permission for this action.");
  if (status === 404) return t("errors.notFound", "The requested record was not found.");
  if (status === 413) return t("errors.upload.fileTooLarge", raw, { maxMb: 15 });
  if (status >= 500) return t("errors.server", "Something went wrong on the server. Please try again in a moment.");

  return raw || t("errors.requestFailed", fallback);
}

export function apiErrorMessage(e: unknown, t?: TFunction): string {
  const translate = t ?? i18n.t.bind(i18n);
  if (e instanceof ApiError) {
    return localizeApiErrorMessage(e.status, e.body, e.message, translate);
  }
  if (e instanceof Error && e.message) {
    for (const { re, key, params } of MESSAGE_PATTERNS) {
      const m = e.message.match(re);
      if (m) return translate(key, e.message, params?.(m) ?? {});
    }
    return e.message;
  }
  return translate("errors.unknown", String(e));
}
