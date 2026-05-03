import { type ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest<{ method?: string; url?: string }>();

    this.logger.error(`${exception.code} ${req.method} ${req.url} — ${exception.message}`, exception.stack);

    if (exception.code === "P2021" || exception.code === "P2022") {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "Schema mismatch",
        message:
          "The database is missing tables or columns required by this API version. From apps/api run: npx prisma migrate deploy && npx prisma db seed",
        prismaCode: exception.code,
      });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : exception.message,
      prismaCode: exception.code,
    });
  }
}
