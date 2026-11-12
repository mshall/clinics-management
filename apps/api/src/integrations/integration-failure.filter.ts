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
import { PrismaService } from "../prisma/prisma.service";
import type { IntegrationPrincipal } from "./integration.types";
import { IntegrationFailureLogService } from "./integration-failure-log.service";
import { parseIntegrationBearerToken } from "./integration-token";

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

    let principal = req.integrationClient;
    if (!principal && status >= 400) {
      const auth = req.headers.authorization;
      const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
      const parsed = parseIntegrationBearerToken(bearer);
      if (parsed) {
        const row = await this.prisma.integrationClient.findFirst({
          where: { clientKey: parsed.clientKey },
          select: { id: true, tenantId: true, name: true },
        });
        if (row) {
          principal = {
            id: row.id,
            clientKey: parsed.clientKey,
            tenantId: row.tenantId,
            name: row.name,
            scopes: [],
            allowedClinicIds: [],
          };
        }
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

    const trace = {
      steps: [
        { step: "request_received", ok: true, detail: `${req.method} ${path}` },
        {
          step: "auth",
          ok: Boolean(principal),
          detail: principal ? `client ${principal.clientKey}` : "no integration principal on request",
        },
        { step: "handler", ok: false, detail: errorMessage },
      ],
      exception: exception instanceof Error ? exception.constructor.name : "UnknownError",
      stack:
        exception instanceof Error && process.env.NODE_ENV !== "production"
          ? exception.stack?.split("\n").slice(0, 12).join("\n")
          : undefined,
    };

    if (principal?.tenantId && status >= 400) {
      const category =
        status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN
          ? IntegrationFailureCategory.AUTH
          : this.failures.inferCategory(path);
      void this.failures.record({
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
        requestContext: {
          query: req.query,
          body: this.failures.sanitizeRequestBody(req.body),
          scopes: principal.scopes,
          allowedClinicIds: principal.allowedClinicIds,
        },
      });
    }

    if (exception instanceof HttpException) {
      res.status(status).json(responseBody);
      return;
    }
    this.logger.error(exception);
    res.status(500).json({ statusCode: 500, message: "Internal server error" });
  }
}
