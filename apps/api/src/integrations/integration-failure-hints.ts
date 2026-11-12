import type { IntegrationFailureCategory } from "@prisma/client";
import { localizeIntegrationFailureResolution } from "./integration-failure-hints-i18n";

export type IntegrationFailureResolution = {
  summary: string;
  actions: string[];
  severity: "info" | "warning" | "critical";
  likelyCause?: string;
};

const DEFAULT: IntegrationFailureResolution = {
  summary: "External integration request failed.",
  actions: [
    "Confirm the integration client is active and scopes include this API.",
    "Verify clinic allowlist on the client includes the target clinic.",
    "Retry with the same externalReference for idempotent booking endpoints.",
  ],
  severity: "warning",
};

export function resolveIntegrationFailureHints(
  category: IntegrationFailureCategory,
  operation: string,
  statusCode: number,
  errorMessage: string,
): IntegrationFailureResolution {
  const msg = errorMessage.toLowerCase();

  if (category === "AUTH" || statusCode === 401) {
    return {
      summary: "Integration authentication failed.",
      likelyCause: "Invalid or rotated bearer token, or deactivated client.",
      actions: [
        "Regenerate the bearer token under Admin → Integration API clients.",
        "Ensure the Authorization header uses format: Bearer kio_live.<clientKey>.<secret>.",
        "Staff JWT tokens are rejected on /integrations/* routes.",
      ],
      severity: "critical",
    };
  }

  if (statusCode === 403) {
    return {
      summary: "Integration client lacks permission for this action.",
      likelyCause: msg.includes("scope") ? "Missing API scope on the client." : "Clinic not in client allowlist.",
      actions: [
        "Add APPOINTMENTS_* or OPERATIONS_* scopes on the integration client.",
        "If using clinic restrictions, add the clinic id to allowed clinics.",
        "Confirm the patient belongs to the tenant and clinic context.",
      ],
      severity: "warning",
    };
  }

  if (category === "WEBHOOK") {
    return {
      summary: "Outbound webhook delivery failed.",
      likelyCause: "Remote endpoint unreachable, TLS issue, or non-2xx response.",
      actions: [
        "Verify the patient portal webhook URL is reachable from the API host.",
        "Validate X-Kiorly-Signature using the signing secret shown at webhook create.",
        "Check last failure message on Admin → Integration API clients → Webhooks.",
      ],
      severity: msg.includes("timeout") ? "critical" : "warning",
    };
  }

  if (category === "APPOINTMENT") {
    if (msg.includes("overlap") || msg.includes("conflict")) {
      return {
        summary: "Appointment slot conflict.",
        likelyCause: "Clinician already booked; confirmOverlap not set.",
        actions: [
          "Call GET /integrations/appointments/availability before booking.",
          "Pass confirmOverlap: true only when double-booking is intentional.",
        ],
        severity: "info",
      };
    }
    if (msg.includes("patient")) {
      return {
        summary: "Patient could not be resolved for booking.",
        likelyCause: "Wrong patientId/MRN or patient archived.",
        actions: [
          "Sync patient records between portal and clinic MRN.",
          "Use GET /api/v1/patients (staff) to validate ids before integration calls.",
        ],
        severity: "warning",
      };
    }
  }

  if (category === "OPERATION") {
    if (msg.includes("down payment") || msg.includes("total cost")) {
      return {
        summary: "Operation pricing validation failed.",
        actions: ["Ensure downPayment ≤ totalCost.", "Use clinic default currency or a valid feeCurrency code."],
        severity: "info",
      };
    }
    if (msg.includes("completed")) {
      return {
        summary: "Cannot cancel a completed operation via integration.",
        actions: ["Only SCHEDULED operations can be cancelled externally.", "Use in-clinic workflow for completed cases."],
        severity: "warning",
      };
    }
  }

  if (statusCode === 404) {
    return {
      summary: "Referenced resource not found.",
      actions: [
        "Confirm ids were created by the same integration client (for GET/cancel).",
        "Check clinicId, clinicianId, and patientId exist in the organization.",
      ],
      severity: "warning",
    };
  }

  if (statusCode === 400) {
    return {
      summary: "Request validation failed.",
      likelyCause: errorMessage,
      actions: [
        "Compare body fields with Swagger /integrations OpenAPI docs.",
        "Send ISO 8601 dates; provide patientId or patientMrn (not both empty).",
      ],
      severity: "info",
    };
  }

  if (operation.includes("BOOK")) {
    return {
      ...DEFAULT,
      summary: `Failed to book via integration (${operation}).`,
    };
  }

  return DEFAULT;
}

export function resolveIntegrationFailureHintsForLocale(
  locale: string | undefined,
  category: IntegrationFailureCategory,
  operation: string,
  statusCode: number,
  errorMessage: string,
): IntegrationFailureResolution {
  const base = resolveIntegrationFailureHints(category, operation, statusCode, errorMessage);
  if (category === "AUTH" || statusCode === 401) {
    return localizeIntegrationFailureResolution(locale, "auth", base);
  }
  if (statusCode === 403) {
    return localizeIntegrationFailureResolution(locale, "forbidden", base);
  }
  if (category === "WEBHOOK") {
    return localizeIntegrationFailureResolution(locale, "webhook", base);
  }
  if (statusCode === 404) {
    return localizeIntegrationFailureResolution(locale, "notFound", base);
  }
  if (statusCode === 400) {
    return localizeIntegrationFailureResolution(locale, "validation", base);
  }
  return localizeIntegrationFailureResolution(locale, "default", base);
}
