import type { IntegrationFailureCategory } from "@prisma/client";

const OPERATION_NAMES: Record<string, string> = {
  BOOK_APPOINTMENT: "Book appointment",
  POST_CANCEL: "Cancel appointment",
  GET_CANCEL: "Cancel appointment",
  GET_AVAILABILITY: "Check appointment availability",
  BOOK_OPERATION: "Schedule operation",
  DELIVER_WEBHOOK: "Deliver webhook",
  GET_VERIFY: "Verify integration token",
  POST_APPOINTMENTS: "Book appointment",
  POST_OPERATIONS: "Schedule operation",
  GET_APPOINTMENT: "Get appointment",
  GET_OPERATION: "Get operation",
  LIST_PHYSICIANS: "List physicians",
  LIST_CLINICS: "List clinics",
};

export function formatIntegrationOperationName(operation: string, category: IntegrationFailureCategory): string {
  const known = OPERATION_NAMES[operation];
  if (known) return known;
  if (operation.includes("BOOK")) return category === "OPERATION" ? "Schedule operation" : "Book appointment";
  if (operation.includes("CANCEL")) return category === "OPERATION" ? "Cancel operation" : "Cancel appointment";
  if (operation.includes("AVAILABILITY")) return "Check availability";
  return operation
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCategoryLabel(category: IntegrationFailureCategory): string {
  const labels: Record<IntegrationFailureCategory, string> = {
    AUTH: "Authentication & authorization",
    APPOINTMENT: "Appointment booking",
    OPERATION: "Surgery / operation booking",
    WEBHOOK: "Outbound webhook",
  };
  return labels[category] ?? category;
}

export function summarizeFailureReason(statusCode: number, errorCode: string | null, errorMessage: string): string {
  const msg = errorMessage.trim();
  if (statusCode === 401) return "Integration token rejected";
  if (statusCode === 403) return "Missing scope or clinic not allowed";
  if (statusCode === 404) return "Resource not found";
  if (statusCode === 409) return "Scheduling conflict";
  if (statusCode === 400 && msg) return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
  if (statusCode >= 500) return "Server error during integration request";
  if (errorCode && msg) return `${errorCode}: ${msg.length > 120 ? `${msg.slice(0, 117)}…` : msg}`;
  return msg || `HTTP ${statusCode} failure`;
}

export function buildFailureReasonDetail(
  statusCode: number,
  errorCode: string | null,
  errorMessage: string,
  httpMethod: string | null | undefined,
  httpPath: string | null | undefined,
  rawResponse?: unknown,
): string {
  const lines: string[] = [
    `HTTP ${statusCode}${errorCode ? ` (${errorCode})` : ""}`,
    ...(httpMethod && httpPath ? [`${httpMethod} ${httpPath}`] : []),
    "",
    errorMessage,
  ];
  if (rawResponse !== undefined && rawResponse !== null) {
    try {
      lines.push("", "API response:", JSON.stringify(rawResponse, null, 2));
    } catch {
      lines.push("", "API response:", String(rawResponse));
    }
  }
  return lines.join("\n").slice(0, 8000);
}
