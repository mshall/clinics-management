import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { IntegrationFailureCategory } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { IntegrationPrincipal } from "./integration.types";
import { IntegrationFailureLogService } from "./integration-failure-log.service";
import { parseIntegrationBearerToken } from "./integration-token";

function enrichIntegrationErrorBody(
  responseBody: unknown,
  correlationId: string,
  failureLogId?: string,
): Record<string, unknown> {
  const base =
    typeof responseBody === "object" && responseBody !== null && !Array.isArray(responseBody)
      ? { ...(responseBody as Record<string, unknown>) }
      : { message: typeof responseBody === "string" ? responseBody : "Request failed" };
  return {
    ...base,
    correlationId,
    ...(failureLogId ? { failureLogId } : {}),
  };
}

@Injectable()
@Catch()
export class IntegrationFailureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(IntegrationFailureExceptionFilter.name);

  constructor(
    private readonly failures: IntegrationFailureLogService,
    private readonly prisma: PrismaService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { integrationClient?: IntegrationPrincipal }>();
    const res = ctx.getResponse<Response>();

    const path = req.path ?? req.url ?? "";

    const respondDefault = () => {
      if (exception instanceof HttpException) {
        res.status(exception.getStatus()).json(exception.getResponse());
        return;
      }
      this.logger.error(exception);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal server error",
      });
    };

    if (!path.includes("/integrations")) {
      respondDefault();
      return;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody =
      exception instanceof HttpException ? exception.getResponse() : { message: "Internal server error" };

    let errorMessage = "Request failed";
    if (typeof responseBody === "string") errorMessage = responseBody;
    else if (responseBody && typeof responseBody === "object") {
      const obj = responseBody as Record<string, unknown>;
      if (typeof obj.message === "string") errorMessage = obj.message;
      else if (Array.isArray(obj.message)) errorMessage = obj.message.map(String).join("; ");
      else if (typeof obj.error === "string") errorMessage = obj.error;
    }

    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const parsedBearer = parseIntegrationBearerToken(bearer);

    let principal = req.integrationClient;
    if (!principal && status >= 400 && parsedBearer) {
      const row = await this.prisma.integrationClient.findFirst({
        where: { clientKey: parsedBearer.clientKey },
        select: { id: true, tenantId: true, name: true, clientKey: true },
      });
      if (row) {
        principal = {
          id: row.id,
          clientKey: row.clientKey,
          tenantId: row.tenantId,
          name: row.name,
          scopes: [],
          allowedClinicIds: [],
        };
      }
    }

    const rawClinicId =
      typeof (req.body as Record<string, unknown> | undefined)?.clinicId === "string"
        ? String((req.body as Record<string, unknown>).clinicId).trim()
        : "";
    let clinicId: string | null = null;
    if (rawClinicId && principal?.tenantId) {
      const clinic = await this.prisma.clinic.findFirst({
        where: { id: rawClinicId, tenantId: principal.tenantId },
        select: { id: true },
      });
      clinicId = clinic?.id ?? null;
    }

    const authOk = Boolean(req.integrationClient);
    const trace = {
      steps: [
        { step: "request_received", ok: true, detail: `${req.method} ${path}` },
        {
          step: "auth",
          ok: authOk,
          detail: authOk
            ? `client ${req.integrationClient!.clientKey}`
            : parsedBearer
              ? `token presented for ${parsedBearer.clientKey} but not accepted`
              : "no integration bearer token",
        },
        {
          step: "authorization",
          ok: status !== HttpStatus.FORBIDDEN,
          detail: status === HttpStatus.FORBIDDEN ? errorMessage : "scope and clinic allowlist",
        },
        {
          step: "validation",
          ok: status !== HttpStatus.BAD_REQUEST,
          detail: status === HttpStatus.BAD_REQUEST ? errorMessage : "request shape accepted",
        },
        {
          step: "resource",
          ok: status !== HttpStatus.NOT_FOUND,
          detail: status === HttpStatus.NOT_FOUND ? errorMessage : "resources resolved",
        },
        { step: "handler", ok: status < 400, detail: status >= 400 ? errorMessage : "completed" },
      ],
      exception: exception instanceof Error ? exception.constructor.name : "UnknownError",
      stack:
        exception instanceof Error && process.env.NODE_ENV !== "production"
          ? exception.stack?.split("\n").slice(0, 12).join("\n")
          : undefined,
    };

    const fallbackCorrelationId: string = randomUUID();
    let correlationId: string = fallbackCorrelationId;
    let failureLogId: string | undefined;

    if (principal?.tenantId && status >= 400) {
      const category =
        status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN
          ? IntegrationFailureCategory.AUTH
          : this.failures.inferCategory(path);
      const recorded = await this.failures.record({
        tenantId: principal.tenantId,
        integrationClientId: principal.id,
        integrationClientName: principal.name,
        clinicId,
        category,
        operation: this.failures.inferOperation(req.method ?? "GET", path),
        httpMethod: req.method,
        httpPath: path,
        statusCode: status,
        errorCode: exception instanceof Error ? exception.constructor.name : "HttpError",
        errorMessage,
        trace,
        rawResponse: responseBody,
        correlationId: fallbackCorrelationId,
        requestContext: {
          query: req.query,
          body: this.failures.sanitizeRequestBody(req.body),
          scopes: principal.scopes,
          allowedClinicIds: principal.allowedClinicIds,
          clientKey: principal.clientKey,
          ...(rawClinicId && !clinicId ? { invalidClinicIdFromRequest: rawClinicId } : {}),
          externalReference:
            typeof (req.body as Record<string, unknown> | undefined)?.externalReference === "string"
              ? (req.body as Record<string, unknown>).externalReference
              : undefined,
        },
      });
      if (recorded) {
        correlationId = recorded.correlationId;
        failureLogId = recorded.id;
      }
    }

    res.setHeader("X-Kiorly-Correlation-Id", correlationId);

    if (exception instanceof HttpException) {
      const body =
        status >= 400 ? enrichIntegrationErrorBody(responseBody, correlationId, failureLogId) : responseBody;
      res.status(status).json(body);
      return;
    }
    this.logger.error(exception);
    res.status(500).json(
      enrichIntegrationErrorBody({ statusCode: 500, message: "Internal server error" }, correlationId, failureLogId),
    );
  }
}
