import { type ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

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

    if (exception instanceof Prisma.PrismaClientKnownRequestError && ["P1000", "P1001", "P1003"].includes(exception.code)) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "Database unavailable",
        message:
          "Cannot connect to PostgreSQL. Start Docker (npm run db:up from repo root) and set apps/api/.env DATABASE_URL to postgresql://cms:cms@localhost:5432/cms?schema=public — then run npm run db:setup.",
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
        message:
          "PostgreSQL is not reachable. Run npm run db:up and npm run db:setup, then confirm apps/api/.env DATABASE_URL matches docker-compose (cms:cms@localhost:5432/cms).",
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
