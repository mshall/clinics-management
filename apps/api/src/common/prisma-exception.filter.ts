import { type ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { replyIfDbPoolExhausted } from "./db-pool-exhausted.filter";

type PrismaHttpError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientUnknownRequestError
  | Prisma.PrismaClientValidationError
  | Prisma.PrismaClientInitializationError;

/** Maps Prisma engine / validation failures to HTTP responses (not only P2xxx known errors). */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError
)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: PrismaHttpError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest<{ method?: string; url?: string }>();

    const code = exception instanceof Prisma.PrismaClientKnownRequestError ? exception.code : "PRISMA_CLIENT";
    this.logger.error(`${code} ${req.method} ${req.url} — ${exception.message}`, exception.stack);

    if (replyIfDbPoolExhausted(exception, host)) return; // P2024 / pool timeout wording: 503 + Retry-After

    if (exception instanceof Prisma.PrismaClientKnownRequestError && (exception.code === "P2021" || exception.code === "P2022")) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "Schema mismatch",
        message:
          "The database is missing tables or columns required by this API version. From apps/api run: npx prisma migrate deploy && npx prisma db seed",
        prismaCode: exception.code,
      });
      return;
    }

    const isProd = process.env.NODE_ENV === "production";

    // Client faults that used to be answered 500 (EDGE-49): unknown id on update/delete, duplicate, foreign key, malformed or out-of-range value, Prisma argument validation (e.g. ?from=garbage -> Invalid Date).
    const fault = prismaClientFault(exception);
    if (fault) {
      res.status(fault.status).json({ statusCode: fault.status, error: fault.error, message: fault.message, prismaCode: code });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError && ["P1000", "P1001", "P1003"].includes(exception.code)) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "Database unavailable",
        message: isProd
          ? "The database is temporarily unavailable. Please try again in a minute."
          : "Cannot connect to PostgreSQL. Start Docker (npm run db:up from repo root) and set apps/api/.env DATABASE_URL to postgresql://cms:cms@localhost:5432/cms?schema=public — then run npm run db:setup.",
        prismaCode: exception.code,
      });
      return;
    }

    if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      (exception instanceof Prisma.PrismaClientUnknownRequestError &&
        /connect|ECONNREFUSED|authentication failed/i.test(exception.message))
    ) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "Database unavailable",
        message: isProd
          ? "The database is temporarily unavailable. Please try again in a minute."
          : "PostgreSQL is not reachable. Run npm run db:up and npm run db:setup, then confirm apps/api/.env DATABASE_URL matches docker-compose (cms:cms@localhost:5432/cms).",
        prismaCode: code,
      });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : exception.message,
      prismaCode: code,
    });
  }
}

/** The 4xx a Prisma error deserves when the CALLER caused it; null = a genuine server fault (stays 500). Exported for tests. */
export function prismaClientFault(e: { name?: string; code?: string; message?: string }): { status: number; error: string; message: string } | null {
  if (e.name === "PrismaClientValidationError") return { status: 400, error: "Bad Request", message: "A value in the request is malformed or out of range" };
  const c = e.code ?? "";
  if (c === "P2025") return { status: 404, error: "Not Found", message: "Record not found" };
  if (c === "P2002") return { status: 409, error: "Conflict", message: "A record with these values already exists" };
  if (c === "P2003" || c === "P2014") return { status: 409, error: "Conflict", message: "The record is referenced by, or references, another record" };
  if (["P2000", "P2005", "P2006", "P2007", "P2008", "P2009", "P2010", "P2011", "P2012", "P2013", "P2019", "P2020", "P2023", "P2033"].includes(c)) return { status: 400, error: "Bad Request", message: "A value in the request is malformed or out of range" };
  return null;
}
