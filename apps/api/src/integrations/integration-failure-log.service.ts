import { Injectable, Logger, Optional } from "@nestjs/common";
import { IntegrationFailureCategory, IntegrationFailureStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildFailureReasonDetail,
  formatCategoryLabel,
  formatIntegrationOperationName,
  summarizeFailureReason,
} from "./integration-failure-labels";
import { computeIntegrationFailureFingerprint } from "./integration-failure-fingerprint";
import { IntegrationFailureGovernanceService } from "./integration-failure-governance.service";
import { resolvePatientFromRequestContext } from "../common/audit-patient-context";

export type IntegrationFailureTrace = {
  steps: Array<{ step: string; ok: boolean; detail?: string }>;
  exception?: string;
  stack?: string;
};

export type RecordIntegrationFailureInput = {
  tenantId: string;
  integrationClientId?: string | null;
  integrationClientName?: string | null;
  clinicId?: string | null;
  category: IntegrationFailureCategory;
  operation: string;
  operationName?: string | null;
  operationTypeLabel?: string | null;
  reason?: string | null;
  reasonDetail?: string | null;
  rawResponse?: unknown;
  httpMethod?: string | null;
  httpPath?: string | null;
  statusCode: number;
  errorCode?: string | null;
  errorMessage: string;
  trace: IntegrationFailureTrace;
  requestContext?: Record<string, unknown> | null;
  correlationId?: string | null;
};

export type RecordIntegrationFailureResult = {
  id: string;
  correlationId: string;
};

const REDACT_KEYS = new Set([
  "password",
  "secret",
  "authorization",
  "token",
  "bearer",
  "signingsecret",
  "nationalid",
  "national_id",
  "emiratesid",
  "mrn",
  "phone",
  "mobile",
  "email",
  "firstname",
  "lastname",
  "patientname",
  "displayname",
]);

const PARTIAL_MASK_KEYS = new Set(["phone", "mobile", "email"]);

@Injectable()
export class IntegrationFailureLogService {
  private readonly log = new Logger(IntegrationFailureLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly governance?: IntegrationFailureGovernanceService,
  ) {}

  sanitizeRequestBody(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (REDACT_KEYS.has(key)) {
        if (PARTIAL_MASK_KEYS.has(key) && typeof v === "string" && v.length > 4) {
          out[k] = `${v.slice(0, 2)}***${v.slice(-2)}`;
        } else {
          out[k] = "[redacted]";
        }
        continue;
      }
      if (typeof v === "string" && v.length > 256) {
        out[k] = `${v.slice(0, 256)}…`;
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
    return out;
  }

  inferCategory(path: string): IntegrationFailureCategory {
    if (path.includes("/integrations/operations")) return IntegrationFailureCategory.OPERATION;
    if (path.includes("/integrations/appointments")) return IntegrationFailureCategory.APPOINTMENT;
    if (path.includes("webhook")) return IntegrationFailureCategory.WEBHOOK;
    return IntegrationFailureCategory.AUTH;
  }

  inferOperation(method: string, path: string): string {
    const m = method.toUpperCase();
    if (path.includes("/cancel")) return `${m}_CANCEL`;
    if (path.includes("/availability")) return `${m}_AVAILABILITY`;
    if (path.includes("/auth/verify")) return `${m}_VERIFY`;
    if (m === "POST" && path.endsWith("/appointments")) return "BOOK_APPOINTMENT";
    if (m === "POST" && path.includes("/operations") && !path.includes("/cancel")) return "BOOK_OPERATION";
    if (m === "GET" && path.includes("/appointments/")) return "GET_APPOINTMENT";
    if (m === "GET" && path.includes("/operations/")) return "GET_OPERATION";
    return `${m}_${path.split("/").filter(Boolean).slice(-2).join("_").toUpperCase() || "REQUEST"}`;
  }

  async record(input: RecordIntegrationFailureInput): Promise<RecordIntegrationFailureResult | null> {
    const correlationId = input.correlationId ?? randomUUID();
    const clinicId = input.clinicId?.trim() || null;
    const operationName = input.operationName ?? formatIntegrationOperationName(input.operation, input.category);
    const operationTypeLabel = input.operationTypeLabel ?? formatCategoryLabel(input.category);
    const reason =
      input.reason ?? summarizeFailureReason(input.statusCode, input.errorCode ?? null, input.errorMessage);
    const reasonDetail =
      input.reasonDetail ??
      buildFailureReasonDetail(
        input.statusCode,
        input.errorCode ?? null,
        input.errorMessage,
        input.httpMethod,
        input.httpPath,
        input.rawResponse,
      );
    const fingerprint = computeIntegrationFailureFingerprint({
      tenantId: input.tenantId,
      integrationClientId: input.integrationClientId,
      operation: input.operation,
      statusCode: input.statusCode,
      reason,
    });
    const patientCtx = await resolvePatientFromRequestContext(
      this.prisma,
      input.tenantId,
      input.httpPath,
      input.requestContext ?? null,
    );
    try {
      const row = await this.prisma.integrationFailureLog.create({
        data: {
          tenantId: input.tenantId,
          integrationClientId: input.integrationClientId ?? null,
          integrationClientName: input.integrationClientName ?? null,
          clinicId,
          category: input.category,
          operation: input.operation,
          operationName,
          operationTypeLabel,
          reason,
          reasonDetail,
          httpMethod: input.httpMethod ?? null,
          httpPath: input.httpPath ?? null,
          statusCode: input.statusCode,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage.slice(0, 4000),
          trace: input.trace as unknown as Prisma.InputJsonValue,
          requestContext: input.requestContext
            ? (input.requestContext as Prisma.InputJsonValue)
            : undefined,
          correlationId,
          fingerprint,
          status: IntegrationFailureStatus.OPEN,
          patientId: patientCtx.patientId,
          patientMrn: patientCtx.patientMrn,
        },
      });
      if (this.governance) {
        void this.governance.maybeAlertSpike(input.tenantId);
      }
      return { id: row.id, correlationId };
    } catch (err) {
      this.log.warn(`Failed to persist integration failure: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
