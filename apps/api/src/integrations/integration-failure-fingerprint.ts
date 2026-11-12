import { createHash } from "node:crypto";

export function computeIntegrationFailureFingerprint(input: {
  tenantId: string;
  integrationClientId?: string | null;
  operation: string;
  statusCode: number;
  reason: string;
}): string {
  const normalizedReason = input.reason.trim().slice(0, 120).toLowerCase();
  const payload = [
    input.tenantId,
    input.integrationClientId ?? "_",
    input.operation,
    String(input.statusCode),
    normalizedReason,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
